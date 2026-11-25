const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

function sortObjKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
}

function formatQueryValue(val: unknown): string {
  if (val === null || val === undefined || val === "undefined" || val === "null") return "";
  if (Array.isArray(val)) {
    return JSON.stringify(
      val.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? sortObjKeys(item as Record<string, unknown>) : item))
    );
  }
  if (typeof val === "object") return JSON.stringify(sortObjKeys(val as Record<string, unknown>));
  return String(val);
}

export function buildPayosDataQuery(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((key) => `${key}=${formatQueryValue(data[key])}`)
    .join("&");
}

export async function signPayosPaymentRequest(
  params: { amount: number; cancelUrl: string; description: string; orderCode: number; returnUrl: string },
  checksumKey: string
): Promise<string> {
  const raw =
    `amount=${params.amount}&cancelUrl=${params.cancelUrl}&description=${params.description}` +
    `&orderCode=${params.orderCode}&returnUrl=${params.returnUrl}`;
  return hmacSha256Hex(checksumKey, raw);
}

export async function verifyPayosWebhookSignature(
  dataObj: Record<string, unknown>,
  signature: string,
  checksumKey: string
): Promise<boolean> {
  if (!checksumKey || !signature || !dataObj || typeof dataObj !== "object") return false;
  const expected = await hmacSha256Hex(checksumKey, buildPayosDataQuery(dataObj));
  const actual = String(signature).trim().toLowerCase();
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

export async function createPayosPaymentLink(cfg: {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const signature = await signPayosPaymentRequest(
    {
      amount: cfg.amount,
      cancelUrl: cfg.cancelUrl,
      description: cfg.description,
      orderCode: cfg.orderCode,
      returnUrl: cfg.returnUrl,
    },
    cfg.checksumKey
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-client-id": cfg.clientId,
        "x-api-key": cfg.apiKey,
      },
      body: JSON.stringify({
        orderCode: cfg.orderCode,
        amount: cfg.amount,
        description: cfg.description,
        returnUrl: cfg.returnUrl,
        cancelUrl: cfg.cancelUrl,
        signature,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.code !== "00" || !body?.data) {
      throw new Error(body?.desc || body?.message || `payOS Error ${res.status}`);
    }
    return body.data as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}
