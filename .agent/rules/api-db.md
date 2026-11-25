# Luật API, Database & Bảo mật (`.agent/rules/api-db.md`)

1. **Chống `PGRST204`:** Khi `POST`/`PATCH` lên bảng `products`, chỉ gửi đúng 6 cột (`id`, `name`, `category`, `price` int, `description`, `is_active` bool) qua `sanitizeProductPayload()`.
2. **Supabase Header chuẩn:** Chỉ gửi `Authorization: Bearer <key>` khi key là JWT (`eyJ...`). Key `sb_publishable_...` chỉ dùng header `apikey`.
3. **Timeout mạng:** Mọi `fetch()` gọi API phải bọc `AbortController` timeout (8000ms) và `clearTimeout` trong `finally`.
4. **Bảo mật Kho & RBAC:**
   - Khóa RLS bảng `inventory_keys` với `anon`. Thao tác Admin chỉ đi qua Edge Function `admin-api` kèm JWT Admin.
   - `isAdminLoggedIn()` phải trả về `false` ở chế độ Demo Local và với tài khoản khách thường.
5. **`localStorage` an toàn:** Bọc `try/catch` qua `safeStorageGet`/`safeStorageSet` kèm `schemaVersion: 1`.
6. **Đồng bộ Schema SQL:** Mọi thay đổi cấu trúc database (SQL) bắt buộc phải cập nhật đồng bộ ngay vào `supabase/schema_backup.sql`.
