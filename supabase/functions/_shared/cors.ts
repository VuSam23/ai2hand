const DEFAULT_ORIGINS = "https://ai2hand.id.vn,https://www.ai2hand.id.vn";

export function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") || DEFAULT_ORIGINS;
  return raw
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
}

export function resolveAllowedOrigin(req: Request): string {
  const allowed = getAllowedOrigins();
  const origin = (req.headers.get("origin") || "").trim().replace(/\/+$/, "");
  if (origin && allowed.includes(origin.toLowerCase())) {
    return origin;
  }
  return allowed[0] || "https://ai2hand.id.vn";
}

export function isOriginAllowed(req: Request): boolean {
  const allowed = getAllowedOrigins();
  const origin = (req.headers.get("origin") || "").trim().replace(/\/+$/, "").toLowerCase();
  return Boolean(origin && allowed.includes(origin));
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

export function jsonCorsResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildCorsHeaders(req),
  });
}

