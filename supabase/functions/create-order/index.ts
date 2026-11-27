import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createPayosPaymentLink } from "../_shared/payos.ts";
import { buildCorsHeaders, isOriginAllowed, jsonCorsResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAYOS_CLIENT_ID = Deno.env.get("PAYOS_CLIENT_ID") ?? "";
const PAYOS_API_KEY = Deno.env.get("PAYOS_API_KEY") ?? "";
const PAYOS_CHECKSUM_KEY = Deno.env.get("PAYOS_CHECKSUM_KEY") ?? "";
const PAYOS_RETURN_URL = Deno.env.get("PAYOS_RETURN_URL") ?? "https://ai2hand.id.vn";
const PAYOS_CANCEL_URL = Deno.env.get("PAYOS_CANCEL_URL") ?? "https://ai2hand.id.vn";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateOrderCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (let i = 0; i < bytes.length; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `ACC${suffix}`;
}

function generatePayosOrderCode(): number {
  const rand = Math.floor(100 + Math.random() * 900);
  return Number(`${Date.now()}${rand}`);
}

async function verifyUser(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id && user?.email ? { id: String(user.id), email: String(user.email) } : null;
}

function normalizeDurationLabel(raw = "1 Tháng"): string {
  const cleaned = String(raw || "1 Tháng").replace(/\|/g, "-").trim().replace(/\s+/g, " ");
  if (!cleaned) return "1 Tháng";
  return cleaned
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function calcDiscount(promo: Record<string, unknown> | null, subTotal: number): number {
  if (!promo || subTotal <= 0) return 0;
  const val = Number(promo.discount_value) || 0;
  if (promo.discount_type === "percent") {
    return Math.round((subTotal * Math.min(100, Math.max(0, val))) / 100);
  }
  return Math.min(subTotal, Math.max(0, Math.round(val)));
}

serve(async (req) => {
  const jsonRes = (body: unknown, status = 200) => jsonCorsResponse(req, body, status);
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  if (req.method !== "POST") return jsonRes({ ok: false, error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("authorization") || "");
  if (!user) return jsonRes({ ok: false, error: "Vui lòng đăng nhập lại để tạo đơn hàng." }, 401);
  if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
    return jsonRes({ ok: false, error: "Hệ thống chưa cấu hình cổng thanh toán payOS." }, 500);
  }

  const svcHeaders = {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };

  try {
    const body = await req.json();
    const productId = String(body.productId || "").trim();
    const qty = Math.max(1, Math.min(50, Math.round(Number(body.quantity) || 1)));
    const duration = normalizeDurationLabel(String(body.duration || "1 Tháng"));
    const accountType = String(body.accountType || "TK cấp sẵn").trim();
    const contact = String(body.contact || "").trim();
    const voucherCode = String(body.voucherCode || "").trim().toUpperCase();
    const trafficSource = String(body.trafficSource || "Direct").trim().slice(0, 64);

    if (!productId || !contact) {
      return jsonRes({ ok: false, error: "Thiếu thông tin gói sản phẩm hoặc liên hệ." }, 400);
    }

    const prodRes = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=*&limit=1`,
      { headers: svcHeaders }
    );
    const prodRows = await prodRes.json();
    const product = Array.isArray(prodRows) ? prodRows[0] : null;
    if (!product || product.is_active === false) {
      return jsonRes({ ok: false, error: "Gói sản phẩm không tồn tại hoặc đang tạm ẩn." }, 404);
    }

    const variantKey = `${duration}|${accountType}`;
    const vpRaw = product.variant_prices && typeof product.variant_prices === "object" ? product.variant_prices : {};
    const vp: Record<string, number> = {};
    for (const [k, v] of Object.entries(vpRaw as Record<string, unknown>)) {
      const [d = "1 Tháng", t = "TK cấp sẵn"] = k.split("|");
      const p = Number(v) || 0;
      if (p >= 1000) vp[`${normalizeDurationLabel(d)}|${t.trim()}`] = p;
    }
    const variantPrice = Number(vp[variantKey] || 0);
    const unitPrice = variantPrice >= 1000 ? variantPrice : Math.round(Number(product.price) || 0);
    if (unitPrice < 1000) {
      return jsonRes({ ok: false, error: "Biến thể sản phẩm chưa được cấu hình giá hợp lệ." }, 400);
    }

    const manualRaw = product.manual_stocks && typeof product.manual_stocks === "object" ? product.manual_stocks : {};
    const manualMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(manualRaw as Record<string, unknown>)) {
      const [d = "1 Tháng", t = "TK cấp sẵn"] = k.split("|");
      const q = Math.max(0, Math.round(Number(v) || 0));
      const nk = `${normalizeDurationLabel(d)}|${t.trim()}`;
      if (q > 0) manualMap[nk] = (manualMap[nk] || 0) + q;
    }
    const manualStock = Math.max(0, Math.round(Number(manualMap[variantKey]) || 0));
    const isManual = manualStock > 0 || accountType === "Dùng chung" || accountType === "Nâng cấp chính chủ";

    if (manualStock > 0) {
      if (manualStock < qty) {
        return jsonRes({ ok: false, error: `Số lượng vượt quá suất mở bán (${manualStock}).` }, 400);
      }
    } else {
      const keyRes = await fetch(
        `${SUPABASE_URL}/rest/v1/inventory_keys?product_id=eq.${encodeURIComponent(productId)}&is_sold=eq.false&select=duration,account_type`,
        { headers: svcHeaders }
      );
      const keyRows = await keyRes.json();
      const availStock = Array.isArray(keyRows)
        ? keyRows.filter(
            (k) =>
              (normalizeDurationLabel(k.duration || "1 Tháng") === duration && (k.account_type || "TK cấp sẵn") === accountType) ||
              k.duration == null ||
              k.account_type == null
          ).length
        : 0;
      if (availStock < qty) {
        return jsonRes({ ok: false, error: `Số lượng vượt quá tồn kho (${availStock}).` }, 400);
      }
    }

    let promo: Record<string, unknown> | null = null;
    if (voucherCode) {
      const pmRes = await fetch(
        `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(voucherCode)}&is_active=eq.true&select=*&limit=1`,
        { headers: svcHeaders }
      );
      const pmRows = await pmRes.json();
      promo = Array.isArray(pmRows) ? pmRows[0] : null;
      if (!promo) return jsonRes({ ok: false, error: "Mã giảm giá không tồn tại hoặc đã tắt." }, 400);
      if (promo.product_id && promo.product_id !== productId) {
        return jsonRes({ ok: false, error: "Mã giảm giá không áp dụng cho gói sản phẩm này." }, 400);
      }
      if (promo.duration && promo.duration !== duration) {
        return jsonRes({ ok: false, error: `Mã giảm giá chỉ áp dụng cho thời hạn ${promo.duration}.` }, 400);
      }
    }

    const subTotal = unitPrice * qty;
    const totalAmount = Math.max(1000, subTotal - calcDiscount(promo, subTotal));
    const orderCode = generateOrderCode();
    const payosOrderCode = generatePayosOrderCode();

    const rawOrigin = (req.headers.get("origin") || "").trim().replace(/\/+$/, "");
    const allowedOrigin = isOriginAllowed(req);
    const returnBase = (allowedOrigin ? rawOrigin : PAYOS_RETURN_URL).replace(/\/$/, "");
    const cancelBase = (allowedOrigin ? rawOrigin : PAYOS_CANCEL_URL).replace(/\/$/, "");

    const payosData = await createPayosPaymentLink({
      clientId: PAYOS_CLIENT_ID,
      apiKey: PAYOS_API_KEY,
      checksumKey: PAYOS_CHECKSUM_KEY,
      orderCode: payosOrderCode,
      amount: totalAmount,
      description: orderCode,
      returnUrl: `${returnBase}/?payment=success&order=${orderCode}`,
      cancelUrl: `${cancelBase}/?payment=cancel&order=${orderCode}`,
    });

    const orderBody = {
      order_code: orderCode,
      payos_order_code: payosOrderCode,
      user_id: user.id,
      product_id: product.id,
      product_name: qty > 1 ? `${product.name} (x${qty})` : product.name,
      quantity: qty,
      duration,
      account_type: accountType,
      contact,
      amount: totalAmount,
      traffic_source: trafficSource || "Direct",
      is_manual: isManual,
      status: "pending",
    };

    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: { ...svcHeaders, Prefer: "return=representation" },
      body: JSON.stringify(orderBody),
    });
    if (!insRes.ok) {
      return jsonRes({ ok: false, error: await insRes.text() }, 400);
    }
    const created = await insRes.json();
    const row = Array.isArray(created) && created[0] ? created[0] : orderBody;
    return jsonRes({
      ok: true,
      data: {
        ...row,
        qrCode: String(payosData.qrCode || ""),
        checkoutUrl: String(payosData.checkoutUrl || ""),
        bin: String(payosData.bin || ""),
        accountNumber: String(payosData.accountNumber || ""),
        accountName: String(payosData.accountName || ""),
        payosDescription: String(payosData.description || orderCode),
      },
    });
  } catch (err) {
    return jsonRes({ ok: false, error: String(err) }, 400);
  }
});
