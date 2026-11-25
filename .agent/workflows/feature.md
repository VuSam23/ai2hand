---
description: Quy trình phát triển tính năng mới (Closed-Loop Plan-First Gate)
---

# Quy Trình Thêm Tính Năng Mới (`feature.md`)

1. **Pha 1 — Plan-First Gate (Bắt buộc dừng chờ duyệt):**
   - Đọc đủ 3 tầng liên quan (`index.html` → `js/services/` → `supabase/functions/` hoặc SQL schema trong `STANDARDS.md`).
   - Kiểm tra số dòng các tệp sẽ sửa để đảm bảo không vượt trần **300 dòng** (tách tệp nếu đang ở vùng vàng `260–299 dòng`).
   - Liệt kê kế hoạch ngắn gọn (tệp sửa/tạo, DOM ID giữ nguyên) và **dừng lại chờ người dùng duyệt**.

2. **Pha 2 — Act (Triển khai trọn gói đúng phạm vi):**
   - Chỉ sử dụng HTML5, CSS3 Variables, Vanilla JS ES6+ và `fetch()` thuần (kèm `AbortController` timeout).
   - Mọi `setInterval` phải có `clearInterval`; dữ liệu `products` chỉ ghi đúng 6 cột hợp lệ.

3. **Pha 3 — Audit (Kiểm thử bắt buộc):**
   - Chạy lệnh kiểm thử giới hạn bộ nhớ và chỉ báo cáo hoàn thành khi exit code `0`:
   ```bash
   node --max-old-space-size=512 scripts/verify.mjs && node --max-old-space-size=512 scripts/test-core.mjs
   ```
