export async function handleManualAction(
  action: string,
  payload: Record<string, unknown>,
  supabaseUrl: string,
  svcHeaders: Record<string, string>,
  jsonRes: (body: unknown, status?: number) => Response
): Promise<Response | null> {
  if (action === "update_manual_stock") {
    const productId = String(payload.productId || "").trim();
    const variantKey = String(payload.variantKey || "").trim();
    const manualStock = Math.max(0, Math.round(Number(payload.manualStock) || 0));
    const nextPrice = Math.round(Number(payload.price) || 0);
    if (!productId || !variantKey) {
      return jsonRes({ ok: false, error: "Thiếu productId hoặc biến thể cần cấu hình." }, 400);
    }

    const curRes = await fetch(
      `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=manual_stocks,variant_prices&limit=1`,
      { headers: svcHeaders }
    );
    const curRows = curRes.ok ? await curRes.json() : [];
    const curManual = (Array.isArray(curRows) && curRows[0]?.manual_stocks) || {};
    const curPrices = (Array.isArray(curRows) && curRows[0]?.variant_prices) || {};

    const nextManual: Record<string, number> = { ...curManual };
    if (manualStock > 0) nextManual[variantKey] = manualStock;
    else delete nextManual[variantKey];

    const patchBody: Record<string, unknown> = { manual_stocks: nextManual };
    if (nextPrice >= 1000) {
      const nextPrices = { ...curPrices, [variantKey]: nextPrice };
      const vals = Object.values(nextPrices).map((v) => Number(v) || 0).filter((v) => v >= 1000);
      patchBody.variant_prices = nextPrices;
      if (vals.length > 0) patchBody.price = Math.min(...vals);
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
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

  if (action === "complete_manual_order") {
    const orderCode = String(payload.orderCode || "").trim();
    const credential = String(payload.credential || "").trim();
    if (!orderCode || !credential) {
      return jsonRes({ ok: false, error: "Thiếu mã đơn hoặc nội dung bàn giao cho khách." }, 400);
    }
    const res = await fetch(
      `${supabaseUrl}/rest/v1/orders?order_code=eq.${encodeURIComponent(orderCode)}&status=eq.pending_manual`,
      {
        method: "PATCH",
        headers: { ...svcHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ status: "paid", delivered_credential: credential }),
      }
    );
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonRes({ ok: false, error: "Đơn hàng không ở trạng thái chờ cấp thủ công." }, 400);
    }
    return jsonRes({ ok: true, data: rows[0] });
  }

  if (action === "update_warranty") {
    const productId = String(payload.productId || "").trim();
    const warranty = String(payload.warranty || "").trim() || "Bảo hành 1 đổi 1 trọn kỳ";
    if (!productId) return jsonRes({ ok: false, error: "Thiếu productId." }, 400);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        headers: { ...svcHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ warranty }),
      }
    );
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    const data = await res.json();
    return jsonRes({ ok: true, data: data[0] });
  }

  if (action === "update_product") {
    const productId = String(payload.productId || "").trim();
    const name = String(payload.name || "").trim();
    if (!productId || !name) return jsonRes({ ok: false, error: "Thiếu mã hoặc tên sản phẩm." }, 400);
    const patchBody = {
      name,
      category: String(payload.category || "Tài khoản AI").trim(),
      description: String(payload.description || "").trim(),
      warranty: String(payload.warranty || "").trim() || "Bảo hành 1 đổi 1 trọn kỳ",
      image_url: String(payload.image_url || "").trim(),
    };
    const res = await fetch(`${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
      method: "PATCH",
      headers: { ...svcHeaders, Prefer: "return=representation" },
      body: JSON.stringify(patchBody),
    });
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    const data = await res.json();
    return jsonRes({ ok: true, data: data[0] });
  }

  if (action === "list_keys") {
    const productId = String(payload.productId || "").trim();
    const filter = productId ? `&product_id=eq.${encodeURIComponent(productId)}` : "";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/inventory_keys?is_sold=eq.false${filter}&select=id,product_id,duration,account_type,credential,created_at&order=created_at.desc&limit=200`,
      { headers: svcHeaders }
    );
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    return jsonRes({ ok: true, data: await res.json() });
  }

  if (action === "delete_key") {
    const id = String(payload.id || "").trim();
    if (!id) return jsonRes({ ok: false, error: "Thiếu id key cần xóa." }, 400);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/inventory_keys?id=eq.${encodeURIComponent(id)}&is_sold=eq.false`,
      { method: "DELETE", headers: svcHeaders }
    );
    if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
    return jsonRes({ ok: true, deletedId: id });
  }

  return null;
}
