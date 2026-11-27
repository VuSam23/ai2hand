### Chặng 2: Đóng gói thương hiệu `ai2hand` & Đưa lên tên miền thật

1. **Đồng bộ nhận diện `ai2hand` & Thẻ chia sẻ MXH:** Cập nhật tên **AI2Hand**, mô tả ngắn gọn và các thẻ Open Graph (`og:title`, `og:description`, `og:image`) trong `index.html` để khi bạn dán link web lên TikTok, Facebook hay Zalo nó hiện ảnh bìa và tiêu đề chuyên nghiệp.
2. **Đẩy web lên Hosting & Gắn tên miền:** Đưa mã nguồn lên **Cloudflare Pages**, **Vercel** hoặc **GitHub Pages** (đều miễn phí, tốc độ cực nhanh cho web tĩnh Vanilla JS), sau đó trỏ tên miền `ai2hand...` vào.
3. **Nạp kho hàng thật:** Xóa các key test trong Admin, nhập kho tài khoản thật và kiểm tra kỹ giá từng biến thể.

---

### Chặng 3: Kéo khách & Giảm tải vận hành (Sau khi mở bán)

1. **Rải link có gắn nguồn đo lường:** Khi đăng video TikTok, bài viết Facebook hoặc gửi nhóm Zalo, luôn gắn đuôi theo dõi:

- Bio TikTok: `[https://tenmiencuaban.com/?src=tiktok](https://tenmiencuaban.com/?src=tiktok)`
- Bài đăng Facebook: `[https://tenmiencuaban.com/?src=fb](https://tenmiencuaban.com/?src=fb)`
- Nhóm Zalo: `[https://tenmiencuaban.com/?src=zalo](https://tenmiencuaban.com/?src=zalo)`
  _(Tab Thống kê Admin sẽ tự gom nhóm để bạn biết kênh nào ra đơn nhiều nhất)._

2. **Bổ sung nút Quên mật khẩu / Đổi mật khẩu cho khách:** Giúp khách tự lấy lại mật khẩu qua email nếu lỡ quên, tránh phải nhắn Zalo nhờ bạn cấp lại thủ công.
3. **Đổi token Telegram lần cuối:** Khi chuẩn bị chạy thật, nhắn `/revoke` cho `@BotFather` thêm một lần nữa và dán thẳng token mới vào Terminal (`npx supabase secrets set TELEGRAM_BOT_TOKEN="..."`) mà không gửi lên khung chat.

## Bạn muốn bắt đầu ngay với việc **cập nhật đồng bộ tên thương hiệu `ai2hand` + thẻ chia sẻ MXH** vào mã nguồn hay cần hướng dẫn chi tiết cách nối **SePay** vào `payment-webhook`?

## Bước 5: Dọn dẹp Dữ liệu Test & Khóa Bảo mật Go-Live

Mục tiêu: Đưa hệ thống về trạng thái sạch sẽ, khóa chặt tên miền và token trước khi quảng bá.

Thao tác thực hiện:

Xóa dữ liệu test: Mở Supabase SQL Editor chạy lệnh xóa các đơn test và key test vừa tạo ở Bước 4, sau đó chỉnh lại bảng giá bán thật trong Admin:

SQL
DELETE FROM public.orders WHERE order_code LIKE 'ACC%';
DELETE FROM public.inventory_keys WHERE account_data LIKE 'test@%';
Khóa tên miền chính thức:

Vào Supabase Dashboard → Authentication → URL Configuration, đặt Site URL và Redirect URLs về đúng tên miền chính thức ([https://ai2hand.id.vn](https://ai2hand.id.vn)).

Vào Supabase Edge Functions → Secrets, kiểm tra biến ALLOWED_ORIGINS chỉ chứa tên miền chính thức (gỡ bỏ localhost nếu không cần thiết).

Xoay vòng Token Telegram: Nhắn /revoke cho @BotFather trên Telegram để lấy token mới, sau đó cập nhật lại lên Supabase bằng lệnh:
