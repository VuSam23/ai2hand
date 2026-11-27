import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyPayosWebhookSignature } from "../_shared/payos.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAYOS_CHECKSUM_KEY = Deno.env.get("PAYOS_CHECKSUM_KEY") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function formatVnd(amount: number): string {
  return `${Math.round(Number(amount) || 0).toLocaleString("vi-VN")}đ`;
}

function sanitizeTelegramText(raw: unknown, maxLen = 180): string {
  return String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>&*_`\[\]]/g, "")
    .trim()
    .slice(0, maxLen) || "Không rõ";
}

async function sendTelegramAlert(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
    if (!tgRes.ok) {
      const errBody = await tgRes.text().catch(() => "");
      console.warn("[Telegram API Error]", tgRes.status, errBody.slice(0, 300));
    }
  } catch (err) {
    const safeErr = TELEGRAM_BOT_TOKEN ? String(err).replaceAll(TELEGRAM_BOT_TOKEN, "[REDACTED]") : String(err);
    console.warn("[Telegram Alert Error]", safeErr);
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method !== "POST") return jsonRes({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const data = body?.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;

    // 1. Hỗ trợ ping kiểm tra kết nối từ Dashboard payOS
    if (!data || Number(data.orderCode) === 123) {
      return jsonRes({ success: true }, 200);
    }

    if (String(body?.code || "") !== "00" || String(data.code || "") !== "00") {
      return jsonRes({ success: true, skipped: "Transaction not completed" }, 200);
    }

    // 2. Xác thực chữ ký HMAC-SHA256 từ payOS
    const validSig = await verifyPayosWebhookSignature(data, String(body?.signature || ""), PAYOS_CHECKSUM_KEY);
    if (!validSig) {
      return jsonRes({ ok: false, error: "Invalid payOS signature" }, 401);
    }

    const payosOrderCode = Number(data.orderCode);
    const amount = Number(data.amount || 0);
    if (!Number.isFinite(payosOrderCode) || payosOrderCode <= 0 || amount <= 0) {
      return jsonRes({ success: true, skipped: "Invalid orderCode or amount" }, 200);
    }

    const headers = {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    };

    // 3. Tra cứu đơn theo payos_order_code
    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?payos_order_code=eq.${encodeURIComponent(String(payosOrderCode))}&select=*&limit=1`,
      { headers }
    );
    const orders = await orderRes.json();
    const order = Array.isArray(orders) ? orders[0] : null;

    if (!order) return jsonRes({ success: true, skipped: "Order not found" }, 200);
    if (order.status === "paid") return jsonRes({ success: true, status: "already_paid" }, 200);
    if (order.status !== "pending") return jsonRes({ success: true, skipped: "Order not pending" }, 200);
    if (amount < Number(order.amount)) return jsonRes({ success: true, skipped: "Insufficient amount" }, 200);

    // 4. Đơn cấp thủ công: chuyển pending_manual, trừ manual_stocks & báo Telegram Admin
    if (order.is_manual) {
      const manualRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fulfill_manual_order`, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_order_code: order.order_code }),
      });
      if (!manualRes.ok) {
        return jsonRes({ ok: false, error: await manualRes.text() }, 500);
      }
      const newlyMarked = await manualRes.json().catch(() => false);
      const safeCode = sanitizeTelegramText(order.order_code, 40);
      const safeProd = sanitizeTelegramText(order.product_name || order.product_id, 120);
      const safeDur = sanitizeTelegramText(order.duration || "1 Tháng", 40);
      const safeType = sanitizeTelegramText(order.account_type || "TK cấp sẵn", 50);
      const safeSrc = sanitizeTelegramText(order.traffic_source || "Direct", 64);
      const safeContact = sanitizeTelegramText(order.contact, 120);
      if (newlyMarked === true) {
        const isShared = String(order.account_type || "").toLowerCase().includes("dùng chung");
        const headerTitle = isShared
          ? "[ĐƠN DÙNG CHUNG (ADD FAMILY) - ĐÃ THANH TOÁN]"
          : "[ĐƠN CẤP THỦ CÔNG - ĐÃ THANH TOÁN]";
        const contactLine = isShared
          ? `Gmail khách cần add vào Family: ${safeContact}`
          : `Email / Zalo khách nhận: ${safeContact}`;
        await sendTelegramAlert(
          `${headerTitle}\n` +
            `Mã đơn: #${safeCode}\n` +
            `Sản phẩm: ${safeProd}\n` +
            `Biến thể: ${safeDur} • ${safeType} (x${order.quantity || 1})\n` +
            `Đã nhận: ${formatVnd(amount)}\n` +
            `Nguồn: ${safeSrc}\n` +
            contactLine
        );
      }
      return jsonRes({ success: true, status: "pending_manual", orderCode: order.order_code }, 200);
    }

    // 5. Rút key tự động & hoàn tất đơn hàng
    const safeCode = sanitizeTelegramText(order.order_code, 40);
    const safeProd = sanitizeTelegramText(order.product_name || order.product_id, 120);
    const safeDur = sanitizeTelegramText(order.duration || "1 Tháng", 40);
    const safeType = sanitizeTelegramText(order.account_type || "TK cấp sẵn", 50);
    const safeSrc = sanitizeTelegramText(order.traffic_source || "Direct", 64);
    const safeContact = sanitizeTelegramText(order.contact, 120);

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fulfill_order`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_order_code: order.order_code }),
    });

    if (!rpcRes.ok) {
      const errText = sanitizeTelegramText(await rpcRes.text(), 220);
      const markRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?order_code=eq.${encodeURIComponent(String(order.order_code))}&status=eq.pending`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ status: "pending_manual" }),
        }
      );
      const markedRows = markRes.ok ? await markRes.json().catch(() => []) : [];
      if (Array.isArray(markedRows) && markedRows.length > 0) {
        await sendTelegramAlert(
          `[KHẨN CẤP - LỖI CẤP KEY]\n` +
            `Mã đơn: #${safeCode}\n` +
            `Sản phẩm: ${safeProd}\n` +
            `Khách đã chuyển: ${formatVnd(amount)}\n` +
            `Liên hệ: ${safeContact}\n` +
            `Trạng thái đã chuyển: pending_manual\n` +
            `Chi tiết lỗi: ${errText}`
        );
      }
      return jsonRes({ success: true, status: "pending_manual", orderCode: order.order_code }, 200);
    }

    const credential = await rpcRes.json();
    await sendTelegramAlert(
      `[ĐƠN HÀNG MỚI THÀNH CÔNG]\n` +
        `Mã đơn: #${safeCode}\n` +
        `Sản phẩm: ${safeProd}\n` +
        `Biến thể: ${safeDur} • ${safeType} (x${order.quantity || 1})\n` +
        `Đã nhận: ${formatVnd(amount)}\n` +
        `Nguồn: ${safeSrc}\n` +
        `Khách nhận: ${safeContact}`
    );
    return jsonRes({ success: true, orderCode: order.order_code, delivered: Boolean(credential) }, 200);
  } catch (err) {
    return jsonRes({ ok: false, error: String(err) }, 400);
  }
});
