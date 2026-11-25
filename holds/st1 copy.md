Dưới đây là hướng dẫn xử lý chi tiết cho từng phần trong 3 bước tích hợp **payOS** vào hệ thống **AI2Hand**, được thiết kế tách module gọn gàng để đảm bảo mọi tệp luôn tuân thủ giới hạn `<= 300 dòng`.

---

### Bước 1: Cập nhật Database trên Supabase (SQL Editor)

Vào **Supabase Dashboard → SQL Editor → New query** và chạy đoạn SQL sau để thêm cột ánh xạ mã đơn số nguyên của payOS và cập nhật hàm `fulfill_order` (hoặc tra cứu `order_code` từ `payos_order_code`):

```sql
-- 1. Thêm cột lưu mã đơn số nguyên của payOS (tối đa 53-bit integer)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payos_order_code BIGINT UNIQUE;

-- 2. Tạo index để webhook tra cứu đơn cực nhanh
CREATE INDEX IF NOT EXISTS idx_orders_payos_order_code
ON public.orders (payos_order_code);

```

---

### Bước 2: Tạo module helper `supabase/functions/_shared/payos.ts`

Tách phần ký và kiểm tra chữ ký **HMAC-SHA256** sang thư mục `_shared/` giúp 2 file Edge Functions chính không bị phình quá 300 dòng:

```ts
// supabase/functions/_shared/payos.ts
const encoder = new TextEncoder();

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Tạo chữ ký khi gọi API tạo link thanh toán payOS
export async function signCreatePayment(
  checksumKey: string,
  params: {
    amount: number;
    cancelUrl: string;
    description: string;
    orderCode: number;
    returnUrl: string;
  },
): Promise<string> {
  const raw = `amount=${params.amount}&cancelUrl=${params.cancelUrl}&description=${params.description}&orderCode=${params.orderCode}&returnUrl=${params.returnUrl}`;
  return await hmacSha256Hex(checksumKey, raw);
}

// Xác thực chữ ký khi nhận Webhook từ payOS (sắp xếp key trong data theo alphabet)
export async function verifyPayosWebhook(
  checksumKey: string,
  data: Record<string, unknown>,
  signature: string,
): Promise<boolean> {
  const sortedKeys = Object.keys(data).sort();
  const raw = sortedKeys
    .map((k) => {
      const val = data[k];
      return `${k}=${val === null || val === undefined ? "" : String(val)}`;
    })
    .join("&");
  const expected = await hmacSha256Hex(checksumKey, raw);
  return expected === signature;
}
```

---

### Bước 3: Xử lý trong `supabase/functions/create-order/index.ts`

Sau khi server đã xác thực user, kiểm tra tồn kho (`inventory_keys`) và tính ra `finalAmount` cùng `orderCode` dạng `ACCxxxxxxxx`, bạn bổ sung đoạn gọi API **payOS** trước khi trả kết quả về frontend:

```ts
import { signCreatePayment } from "../_shared/payos.ts";

// 1. Sinh mã đơn số nguyên duy nhất cho payOS (13-15 chữ số, < Number.MAX_SAFE_INTEGER)
const payosOrderCode = Number(
  `${Date.now()}${Math.floor(10 + Math.random() * 89)}`,
);
const description = orderCode; // VD: "ACC8F2A91B4" (<= 25 ký tự, không dấu)
const originUrl = req.headers.get("origin") || "https://ai2hand.vn";

// 2. Ký dữ liệu bằng PAYOS_CHECKSUM_KEY
const signature = await signCreatePayment(Deno.env.get("PAYOS_CHECKSUM_KEY")!, {
  amount: finalAmount,
  cancelUrl: `${originUrl}/?payment=cancel&order=${orderCode}`,
  description,
  orderCode: payosOrderCode,
  returnUrl: `${originUrl}/?payment=success&order=${orderCode}`,
});

// 3. Gọi API tạo QR động trên payOS
const payosRes = await fetch(
  "https://api-merchant.payos.vn/v2/payment-requests",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": Deno.env.get("PAYOS_CLIENT_ID")!,
      "x-api-key": Deno.env.get("PAYOS_API_KEY")!,
    },
    body: JSON.stringify({
      orderCode: payosOrderCode,
      amount: finalAmount,
      description,
      cancelUrl: `${originUrl}/?payment=cancel&order=${orderCode}`,
      returnUrl: `${originUrl}/?payment=success&order=${orderCode}`,
      signature,
    }),
  },
);

const payosJson = await payosRes.json();
if (payosJson.code !== "00") {
  throw new Error(`payOS error: ${payosJson.desc}`);
}

// 4. Lưu payos_order_code vào bản ghi orders vừa tạo (dùng service_role)
await supabaseAdmin
  .from("orders")
  .update({ payos_order_code: payosOrderCode })
  .eq("order_code", orderCode);

// 5. Trả về frontend: payosJson.data.qrCode và payosJson.data.checkoutUrl
```

**Ở phía Frontend (hiển thị ảnh QR):**

- Thay vì tự ghép link `img.vietqr.io` tĩnh, bạn lấy `qrCode` trả về từ `create-order` và render thành ảnh QR bằng API tạo QR chuẩn (hoặc thư viện QR nhẹ trên client):
  `[https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=$](https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=$){encodeURIComponent(data.qrCode)}`
- Khách quét mã này trên app ngân hàng sẽ tự điền đúng số tiền, nội dung và khi chuyển khoản xong payOS bắn webhook ngay lập tức.

---

### Bước 4: Xử lý trong `supabase/functions/payment-webhook/index.ts`

Trong `payment-webhook/index.ts`, thay phần kiểm tra `WEBHOOK_SECRET` cũ bằng logic xử lý chuẩn của **payOS**:

```ts
import { verifyPayosWebhook } from "../_shared/payos.ts";

const body = await req.json();

// 1. Xử lý gói tin test kết nối khi bấm "Lưu" Webhook Url trên Dashboard payOS
if (!body?.data || !body?.signature || body.data.orderCode === 123) {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// 2. Xác thực chữ ký giao dịch thật từ payOS
const isValid = await verifyPayosWebhook(
  Deno.env.get("PAYOS_CHECKSUM_KEY")!,
  body.data,
  body.signature,
);

if (!isValid) {
  return new Response(JSON.stringify({ error: "Invalid signature" }), {
    status: 401,
  });
}

// 3. Chỉ xử lý khi giao dịch thành công (code === "00")
if (body.code === "00" && body.data?.code === "00") {
  const payosOrderCode = Number(body.data.orderCode);
  const paidAmount = Number(body.data.amount);

  // Tìm mã đơn ACCxxxxxxxx tương ứng trong bảng orders
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("order_code, total_amount, status")
    .eq("payos_order_code", payosOrderCode)
    .single();

  if (order && order.status === "pending" && paidAmount >= order.total_amount) {
    // Gọi RPC fulfill_order hiện có để nhả key và gửi thông báo Telegram
    await supabaseAdmin.rpc("fulfill_order", {
      p_order_code: order.order_code,
    });
    // Gọi sendTelegramAlert(...) hiện có của dự án
  }
}

// Luôn trả 200 OK để payOS xác nhận đã nhận webhook
return new Response(JSON.stringify({ success: true }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});
```

---

### Bước 5: Deploy & Bấm Lưu trên payOS

1. Chạy lệnh deploy tắt kiểm tra JWT mặc định cho `payment-webhook` (để fix lỗi `401` khi payOS gọi sang):

```bash
npx supabase functions deploy create-order
npx supabase functions deploy payment-webhook --no-verify-jwt

```

2. Chạy 2 script kiểm thử bắt buộc của dự án:

```bash
node --max-old-space-size=512 scripts/verify.mjs
node --max-old-space-size=512 scripts/test-core.mjs

```

3. Quay lại tab **Cài đặt** trên **payOS** và bấm nút **Lưu** bên cạnh `[https://sfzsidgkqrilripijvft.supabase.co/functions/v1/payment-webhook](https://sfzsidgkqrilripijvft.supabase.co/functions/v1/payment-webhook)` — hệ thống sẽ nhận mã `200 OK` và kích hoạt cổng thanh toán ngay lập tức.

Nếu bạn gửi nội dung 2 file `create-order/index.ts` và `payment-webhook/index.ts` hiện tại lên đây, mình sẽ ghép trực tiếp đoạn code trên vào đúng cấu trúc biến & hàm `sendTelegramAlert` sẵn có của bạn.
