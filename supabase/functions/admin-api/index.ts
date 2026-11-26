import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handlePromoAction } from "./promos.ts";
import { handleManualAction } from "./manual.ts";
import { buildCorsHeaders, jsonCorsResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function verifyAdminUser(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, email: "" };

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { status: 401, email: "" };

  const user = await res.json();
  const email = String(user?.email ?? "").toLowerCase();
  if (!email) return { status: 401, email: "" };
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) return { status: 403, email };
  return { status: 200, email, id: user.id };
}

function sanitizeProductPayload(raw: Record<string, unknown>, idOverride?: string) {
  const row: Record<string, unknown> = {};
  if (idOverride) row.id = idOverride;
  if (raw.name !== undefined) row.name = String(raw.name).trim();
  if (raw.category !== undefined) row.category = String(raw.category || "Tài khoản AI").trim();
  if (raw.variant_prices && typeof raw.variant_prices === "object") {
    const cleanPrices: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.variant_prices as Record<string, unknown>)) {
      const p = Math.round(Number(v) || 0);
      if (k.trim() && p >= 1000) cleanPrices[k.trim()] = p;
    }
    row.variant_prices = cleanPrices;
    const vals = Object.values(cleanPrices);
    if (vals.length > 0) row.price = Math.min(...vals);
  }
  if (row.price === undefined && raw.price !== undefined) {
    row.price = Math.max(0, Math.round(Number(raw.price) || 0));
  }
  if (raw.description !== undefined) {
    row.description = String(raw.description || "Tài khoản bản quyền chính hãng, bảo hành 1 đổi 1.").trim();
  }
  if (raw.image_url !== undefined) {
    row.image_url = String(raw.image_url || "").trim();
  }
  if (raw.warranty !== undefined && String(raw.warranty).trim()) {
    row.warranty = String(raw.warranty).trim();
  }
  row.is_active = raw.is_active !== undefined ? Boolean(raw.is_active) : true;
  return row;
}

serve(async (req) => {
  const jsonRes = (body: unknown, status = 200) => jsonCorsResponse(req, body, status);
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  if (req.method !== "POST") return jsonRes({ ok: false, error: "Method not allowed" }, 405);

  const admin = await verifyAdminUser(req.headers.get("authorization") || "");
  if (admin.status === 401) return jsonRes({ ok: false, error: "Unauthorized: token thiếu hoặc hết hạn" }, 401);
  if (admin.status === 403) {
    return jsonRes({ ok: false, email: admin.email, error: `Tài khoản ${admin.email} không có quyền Admin.` }, 403);
  }

  const svcHeaders = {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };

  try {
    const { action, payload = {} } = await req.json();

    if (action === "add_product") {
      const slug = `${String(payload.name || "pkg")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

      const row = sanitizeProductPayload(payload, slug);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
        method: "POST",
        headers: { ...svcHeaders, Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
      const data = await res.json();
      return jsonRes({ ok: true, data: data[0] ?? row });
    }

    if (action === "update_stock") {
      const isActive =
        payload.is_active !== undefined
          ? Boolean(payload.is_active)
          : (Number.parseInt(String(payload.stock ?? 0), 10) || 0) > 0;
      const patchBody = { is_active: isActive };
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(payload.productId)}`,
        {
          method: "PATCH",
          headers: { ...svcHeaders, Prefer: "return=representation" },
          body: JSON.stringify(patchBody),
        }
      );
      if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
      const data = await res.json();
      return jsonRes({ ok: true, data: data[0] });
    }

    if (action === "update_price") {
      const productId = String(payload.productId || "").trim();
      const nextPrice = Number(payload.price);
      if (!productId || !Number.isFinite(nextPrice) || nextPrice < 1000) {
        return jsonRes({ ok: false, error: "Giá bán phải từ 1.000đ trở lên." }, 400);
      }
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
        {
          method: "PATCH",
          headers: { ...svcHeaders, Prefer: "return=representation" },
          body: JSON.stringify({ price: Math.round(nextPrice) }),
        }
      );
      if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
      const data = await res.json();
      return jsonRes({ ok: true, data: data[0] });
    }

    if (action === "update_variant_price") {
      const productId = String(payload.productId || "").trim();
      const variantKey = String(payload.variantKey || "").trim();
      const nextPrice = Math.round(Number(payload.price) || 0);
      if (!productId || !variantKey || nextPrice < 1000) {
        return jsonRes({ ok: false, error: "Thiếu biến thể hoặc giá bán < 1.000đ." }, 400);
      }
      const curRes = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=variant_prices&limit=1`,
        { headers: svcHeaders }
      );
      const curRows = curRes.ok ? await curRes.json() : [];
      const curMap = (Array.isArray(curRows) && curRows[0]?.variant_prices) || {};
      const nextMap = { ...curMap, [variantKey]: nextPrice };
      const vals = Object.values(nextMap).map((v) => Number(v) || 0).filter((v) => v >= 1000);
      const patchBody: Record<string, unknown> = { variant_prices: nextMap };
      if (vals.length > 0) patchBody.price = Math.min(...vals);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
        {
          method: "PATCH",
          headers: { ...svcHeaders, Prefer: "return=representation" },
          body: JSON.stringify(patchBody),
        }
      );
      if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
      const data = await res.json();
      return jsonRes({ ok: true, data: data[0] });
    }

    if (action === "delete_product") {
      const productId = String(payload.productId || "").trim();
      if (!productId) return jsonRes({ ok: false, error: "Thiếu productId cần xóa." }, 400);
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/inventory_keys?product_id=eq.${encodeURIComponent(productId)}&is_sold=eq.false&select=id&limit=1`,
        { headers: svcHeaders }
      );
      const unsold = checkRes.ok ? await checkRes.json() : [];
      if (Array.isArray(unsold) && unsold.length > 0) {
        return jsonRes({ ok: false, error: "Không thể xóa gói đang còn key chưa bán trong kho." }, 400);
      }
      const delRes = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
        { method: "DELETE", headers: svcHeaders }
      );
      if (!delRes.ok) {
        const errText = await delRes.text();
        if (/23503|foreign key|orders|inventory_keys/i.test(errText)) {
          return jsonRes(
            {
              ok: false,
              error: "Gói này đã có lịch sử đơn hàng hoặc key đã bán, không thể xóa vĩnh viễn. Vui lòng dùng nút 'Tạm ẩn'!",
            },
            400
          );
        }
        return jsonRes({ ok: false, error: errText }, 400);
      }
      return jsonRes({ ok: true, deletedId: productId });
    }

    if (action === "import_keys") {
      const productId = String(payload.productId || "").trim();
      if (!productId) return jsonRes({ ok: false, error: "Thiếu productId gói cần nạp kho" }, 400);

      const duration = String(payload.duration || "1 Tháng").trim();
      const accountType = String(payload.accountType || "Tài khoản riêng").trim();
      const lines = Array.isArray(payload.lines) ? payload.lines : [];
      if (lines.length === 0) return jsonRes({ ok: false, error: "Danh sách key rỗng" }, 400);

      const uniqueInput = [...new Set(lines.map((c: string) => String(c).trim()).filter(Boolean))];
      const existRes = await fetch(
        `${SUPABASE_URL}/rest/v1/inventory_keys?product_id=eq.${encodeURIComponent(productId)}&select=credential`,
        { headers: svcHeaders }
      );
      const existRows = existRes.ok ? await existRes.json() : [];
      const existSet = new Set(
        Array.isArray(existRows) ? existRows.map((r: { credential?: string }) => String(r.credential || "").trim()) : []
      );
      const uniqueLines = uniqueInput.filter((cred) => !existSet.has(cred));
      const duplicateCount = lines.length - uniqueLines.length;

      if (uniqueLines.length > 0) {
        const keysPayload = uniqueLines.map((cred: string) => ({
          product_id: productId,
          duration,
          account_type: accountType,
          credential: cred,
          is_sold: false,
        }));
        const keyRes = await fetch(`${SUPABASE_URL}/rest/v1/inventory_keys`, {
          method: "POST",
          headers: svcHeaders,
          body: JSON.stringify(keysPayload),
        });
        if (!keyRes.ok) return jsonRes({ ok: false, error: await keyRes.text() }, 400);

        await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
          method: "PATCH",
          headers: svcHeaders,
          body: JSON.stringify({ is_active: true }),
        });
      }

      const countRes = await fetch(
        `${SUPABASE_URL}/rest/v1/inventory_keys?product_id=eq.${encodeURIComponent(productId)}&is_sold=eq.false&select=id`,
        { headers: svcHeaders }
      );
      const availRows = countRes.ok ? await countRes.json() : [];
      const updatedStock = Array.isArray(availRows) ? availRows.length : uniqueLines.length;
      return jsonRes({ ok: true, importedCount: uniqueLines.length, duplicateCount, updatedStock });
    }

    if (action === "list_orders") {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc&limit=200`, {
        headers: svcHeaders,
      });
      if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
      return jsonRes({ ok: true, data: await res.json() });
    }

    const promoRes = await handlePromoAction(action, payload, SUPABASE_URL, svcHeaders, jsonRes);
    if (promoRes) return promoRes;

    const manualRes = await handleManualAction(action, payload, SUPABASE_URL, svcHeaders, jsonRes);
    if (manualRes) return manualRes;

    return jsonRes({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonRes({ ok: false, error: String(err) }, 400);
  }
});
