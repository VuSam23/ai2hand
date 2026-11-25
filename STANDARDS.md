# STANDARDS.md — Luật Cốt Lõi & Schema Truth (WebAccount)

## 1. Luật Bất Biến
- **Zero-Bloat:** HTML5, CSS3 Variables, Vanilla JS ES6+ (`type="module"`), `fetch()` thuần. Cấm thư viện/SDK nặng.
- **4 Tầng độc lập:** `config/` → `services/` → `ui/` → `app.js` (tầng `services/` cấm chạm DOM).
- **Trần kích thước:** Mọi tệp JS/TS tối đa **300 dòng** (Cảnh báo Vàng: `260–299 dòng`).
- **DOM Integrity:** Giữ nguyên 100% `id` và `data-*` đang dùng trên `index.html`.
- **Đồng bộ Schema SQL:** Mọi thay đổi cấu trúc database (SQL) bắt buộc phải cập nhật đồng bộ ngay vào `supabase/schema_backup.sql`.
- **Báo cáo Token sau mỗi lần chạy:** Dòng cuối của **mọi lượt phản hồi** luôn ghi đúng 1 dòng thống kê (`~4 ký tự = 1 token`): `📊 Token lượt này: ~X,XXX tokens (Input: ~Y dòng đọc | Output: ~Z dòng xuất)`.

## 2. Database Schema Truth (Chống PGRST204)
- **`products`**: `id`, `name`, `category`, `price` (int), `description`, `is_active` (bool).
  - *Cấm ghi:* `duration`, `stock`, `strike_price` lên `products`.
- **`orders`**: `order_code`, `product_id`, `product_name`, `duration`, `account_type`, `contact`, `amount`, `status`, `delivered_credential`, `created_at`.
- **`inventory_keys`**: `id`, `product_id`, `duration`, `account_type`, `credential`, `is_sold`, `order_code`, `created_at`.

## 3. Chỉ mục Progressive Disclosure (Đọc đúng miền cần sửa)
| Miền công việc | Tài liệu cần đọc |
| :--- | :--- |
| Định vị nhanh file & khoảng dòng HTML | [.agent/code-map.md](file:///c:/Users/vu%20sam/Downloads/WebAccount/.agent/code-map.md) |
| Giao diện, DOM ID, CSS Mobile-First | [.agent/rules/ui-dom.md](file:///c:/Users/vu%20sam/Downloads/WebAccount/.agent/rules/ui-dom.md) |
| Supabase REST, Auth/RBAC, Storage | [.agent/rules/api-db.md](file:///c:/Users/vu%20sam/Downloads/WebAccount/.agent/rules/api-db.md) |
| Tài nguyên, RAM & Lệnh kiểm thử | [.agent/rules/test-ram.md](file:///c:/Users/vu%20sam/Downloads/WebAccount/.agent/rules/test-ram.md) |

## 4. Vòng lặp Bắt buộc
```bash
node --max-old-space-size=512 scripts/verify.mjs && node --max-old-space-size=512 scripts/test-core.mjs
```
