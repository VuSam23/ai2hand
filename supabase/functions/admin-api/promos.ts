export async function handlePromoAction(
  action: string,
  payload: Record<string, unknown>,
  supabaseUrl: string,
  svcHeaders: Record<string, string>,
  jsonRes: (data: unknown, status?: number) => Response
): Promise<Response | null> {
  if (action === "list_promos") {
    const res = await fetch(`${supabaseUrl}/rest/v1/promo_codes?select=*&order=created_at.desc`, {
      headers: svcHeaders,
    });
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    return jsonRes({ ok: true, data: await res.json() });
  }

  if (action === "upsert_promo") {
    const code = String(payload.code || "").trim().toUpperCase();
    const discountType = payload.discount_type === "fixed" ? "fixed" : "percent";
    const discountValue = Math.round(Number(payload.discount_value) || 0);
    const productId = String(payload.product_id || "").trim() || null;
    const duration = String(payload.duration || "").trim() || null;

    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      return jsonRes({ ok: false, error: "Mã giảm giá gồm 3-32 ký tự chữ/số/gạch ngang." }, 400);
    }
    if (discountType === "percent" && (discountValue < 1 || discountValue > 100)) {
      return jsonRes({ ok: false, error: "Giảm giá theo % phải từ 1 đến 100." }, 400);
    }
    if (discountType === "fixed" && discountValue < 1000) {
      return jsonRes({ ok: false, error: "Giảm giá cố định phải từ 1.000đ trở lên." }, 400);
    }

    const row = {
      code,
      discount_type: discountType,
      discount_value: discountValue,
      product_id: productId,
      duration,
      is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    };
    const res = await fetch(`${supabaseUrl}/rest/v1/promo_codes?on_conflict=code`, {
      method: "POST",
      headers: { ...svcHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    const data = await res.json();
    return jsonRes({ ok: true, data: data[0] ?? row });
  }

  if (action === "toggle_promo") {
    const id = String(payload.id || "").trim();
    if (!id) return jsonRes({ ok: false, error: "Thiếu id mã giảm giá." }, 400);
    const res = await fetch(`${supabaseUrl}/rest/v1/promo_codes?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...svcHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ is_active: Boolean(payload.is_active) }),
    });
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    const data = await res.json();
    return jsonRes({ ok: true, data: data[0] });
  }

  if (action === "delete_promo") {
    const id = String(payload.id || "").trim();
    if (!id) return jsonRes({ ok: false, error: "Thiếu id mã giảm giá." }, 400);
    const res = await fetch(`${supabaseUrl}/rest/v1/promo_codes?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: svcHeaders,
    });
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    return jsonRes({ ok: true, deletedId: id });
  }

  return null;
}
