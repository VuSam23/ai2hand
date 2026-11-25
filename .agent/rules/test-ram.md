# Luật Kiểm thử & Giới hạn RAM (`.agent/rules/test-ram.md`)

1. **Giới hạn kích thước tệp:** Mọi tệp trong `js/` và `supabase/functions/` không vượt quá **300 dòng** (vùng vàng cảnh báo: `260–299 dòng`).
2. **Chống rò rỉ tài nguyên:** Mọi `setInterval(` (polling, countdown) phải có `clearInterval(` tương ứng khi đóng modal, chuyển tab hoặc hết giờ.
3. **Tối ưu máy 8GB RAM:** Tuyệt đối không cài Playwright/Puppeteer, không chạy trình duyệt ảo hoặc tiến trình nền không có timeout.
4. **Cầu chì test:** Mọi script test tự động trong `scripts/` phải có `setTimeout(..., 8000).unref()` để tự ngắt nếu treo vòng lặp.
5. **Lệnh xác minh bắt buộc (Exit code `0`):**
   ```powershell
   node --max-old-space-size=512 scripts/verify.mjs; if ($?) { node --max-old-space-size=512 scripts/test-core.mjs }
   ```
