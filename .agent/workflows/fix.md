---
description: Quy trình sửa lỗi xuyên suốt các tầng (Root-Cause Fix & Audit)
---

# Quy Trình Sửa Lỗi Hệ Thống (`fix.md`)

1. **Chẩn đoán nguyên nhân gốc (1 lần xuyên suốt mọi tầng):**
   - Đối chiếu đồng thời Frontend (`index.html`, `js/ui/`, `js/services/`) và Backend (`supabase/functions/`, Schema Truth trong `STANDARDS.md`) để tìm nguyên nhân gốc, không vá từng lỗi lẻ.

2. **Sửa đồng bộ:**
   - Cập nhật đồng nhất từ tầng `config`/`services` lên `ui`/`app` hoặc Edge Function, giữ nguyên 100% DOM ID cũ và giới hạn `< 300 dòng/tệp`.

3. **Kiểm thử bắt buộc & Deploy:**
   - Chạy lệnh xác minh giới hạn RAM:
   ```bash
   node --max-old-space-size=512 scripts/verify.mjs && node --max-old-space-size=512 scripts/test-core.mjs
   ```
   - Nếu có chỉnh sửa Edge Function trong `supabase/functions/`, đính kèm lệnh deploy tương ứng:
   ```bash
   npx supabase functions deploy <tên_function> --no-verify-jwt
   ```
