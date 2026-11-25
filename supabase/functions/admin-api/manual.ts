export async function handleManualAction(
  action: string,
  payload: Record<string, unknown>,
  supabaseUrl: string,
  svcHeaders: Record<string, string>,
  jsonRes: (body: unknown, status?: number) => Response
): Promise<Response | null> {
  if (action !== "update_manual_stock") return null;

  const productId = String(payload.productId || "").trim();
  const variantKey = String(payload.variantKey || "").trim();
  const manualStock = Math.max(0, Math.round(Number(payload.manualStock) || 0));
  if (!productId || !variantKey) {
    return jsonRes({ ok: false, error: "Thiếu productId hoặc biến thể cần cấu hình." }, 400);
  }

  const curRes = await fetch(
    `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=manual_stocks&limit=1`,
    { headers: svcHeaders }
  );
  const curRows = curRes.ok ? await curRes.json() : [];
  const curMap = (Array.isArray(curRows) && curRows[0]?.manual_stocks) || {};
  const nextMap: Record<string, number> = { ...curMap };
  if (manualStock > 0) nextMap[variantKey] = manualStock;
  else delete nextMap[variantKey];

  const res = await fetch(
    `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      headers: { ...svcHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ manual_stocks: nextMap }),
    }
  );
  if (!res.ok) return jsonRes({ ok: false, error: await res.text() }, 400);
  const data = await res.json();
  return jsonRes({ ok: true, data: data[0] });
}

