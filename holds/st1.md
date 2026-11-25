Hệ thống lõi của **ai2hand** (bảo mật tạo đơn, tự động nhả nhiều key, báo đơn qua Telegram, thống kê Admin) đã xong. Từ giờ bạn không nên code thêm tính năng rườm rà nữa mà tập trung đưa web ra nhận tiền thật theo 3 chặng gọn sau:

### Chặng 1: Chốt hạ kỹ thuật để nhận tiền thật (Làm ngay — ~15 phút)

1. **Điền tài khoản ngân hàng thật vào `js/config.js`:** Hiện khung QR vẫn đang hiện `[MA_NGAN_HANG]` và `[SO_TAI_KHOAN]`. Bạn mở `js/config.js`, điền đúng mã ngân hàng (`MB`, `VCB`, `TCB`, `ACB`...), số tài khoản và tên chủ tài khoản để web sinh ảnh mã VietQR thật.
2. **Nối biến động số dư ngân hàng (SePay hoặc Casso) vào `payment-webhook`:**

- Đăng ký tài khoản miễn phí trên **SePay.vn** (hoặc Casso), liên kết tài khoản ngân hàng nhận tiền.
- Dán URL Webhook của Supabase (`https://<PROJECT_REF>.supabase.co/functions/v1/payment-webhook`) và mã `WEBHOOK_SECRET` vào cấu hình của SePay/Casso để mỗi khi tiền vào tài khoản, SePay tự động gọi Supabase nhả key ngay lập tức.

3. **Test 1 giao dịch thật 2.000đ:** Tạo một gói test hoặc mã giảm giá đưa đơn về `2.000đ`, dùng app ngân hàng quét mã QR chuyển khoản thật để nghiệm thu trọn vẹn vòng khép kín: _Tiền vào → Web tự hiện key → Telegram `@ai2hand_notify_bot` ting ting → Tab Thống kê Admin nhảy số_.

---

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

Bạn muốn bắt đầu ngay với việc **cập nhật đồng bộ tên thương hiệu `ai2hand` + thẻ chia sẻ MXH** vào mã nguồn hay cần hướng dẫn chi tiết cách nối **SePay** vào `payment-webhook`?
