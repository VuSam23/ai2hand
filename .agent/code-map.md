# Code Map — WebAccount (Progressive Disclosure)

## 1. Khoảng dòng chính trong `index.html`
- `L129–180`: `<header class="site-header">` (Search `#global-search`, Nav, Avatar `#view-account`).
- `L186–322`: `#view-home` (Sidebar `#home-sidebar`, Banner, Toolbar `#catalog-sort`, `#product-grid`).
- `L324–460`: `#view-product-detail` (Hero, `#detail-duration-options`, `#detail-account-types`, `#detail-sticky-bar`).
- `L462–670`: `#view-account` (Hồ sơ `#acc-profile-card`, Tab `#acc-tab-overview`, Tab `#acc-tab-orders` + Stat cards + `#account-orders-tbody`).
- `L672–720`: `#view-admin-login` (`#admin-login-form`, Đăng ký & Quên mật khẩu).
- `L707–936`: `#view-admin` (Sidebar `#admin-sidebar-nav` + 4 tab `#admin-tab-stats`, `#admin-tab-products`, `#admin-tab-inventory`, `#admin-tab-orders`).
- `L946–964`: `.mobile-bottom-nav` | `L966–1105`: `#checkout-modal` (VietQR 3 bước + Voucher).

## 2. Phân tầng JavaScript (`js/`) & Backend (`supabase/functions/`)
- **Tầng 1 (`config/`):** `js/config/config.js` (Supabase URL/key, `adminEmails`, VietQR, `VOUCHERS`, regex).
- **Tầng 2 (`services/`):**
  - `js/services/storage.js`: Wrapper `localStorage` (`try/catch`, `schemaVersion: 1`), dữ liệu mẫu.
  - `js/services/mockApi.js`: Giả lập Store/Order/Vault local.
  - `js/services/supabaseApi.js` & `js/services/supabaseMappers.js`: `fetch()` REST `products`/`orders`, gọi `create-order`, `pollOrderStatus()`.
  - `js/services/promoApi.js`: Kiểm tra & tính toán Mã giảm giá `promo_codes`.
  - `js/services/adminApi.js`: Auth (`/auth/v1/token`), RBAC `isAdminLoggedIn()`, gọi `admin-api` (retry 401, báo 403).
  - `js/services/authRefresh.js`: Lưu phiên, `isTokenExpiringSoon()`, `refreshAccessToken()` (khóa promise chống refresh trùng).
  - `js/services/imageUpload.js`: Resize ảnh `<= 256px` và upload lên Supabase Storage `product-icons`.
  - `js/services/trafficSource.js`: Theo dõi nguồn truy cập First-touch (UTM / Referrer).
- **Tầng 3 (`ui/`):**
  - `js/ui/uiCommon.js`: `formatVnd`, `escapeHtml`, `showToast`, `copyText`, `downloadTextFile`.
  - `js/ui/uiStore.js`: Render danh mục, lưới thẻ `#product-grid`, chi tiết `#view-product-detail`.
  - `js/ui/uiCheckoutSteps.js` & `js/ui/uiCheckout.js`: Modal VietQR 3 bước, Voucher, đếm ngược `00:00`.
  - `js/ui/uiAccount.js` & `js/ui/handlersAccount.js`: Render & sự kiện Account, Auth.
  - `js/ui/uiAdminStats.js` & `js/ui/uiAdminRender.js` (`switchAdminTab`, `renderAdminView`) & `js/ui/uiAdmin.js`: Thống kê, Render, chuyển Tab & sự kiện trang Quản trị Admin Kho (`#view-admin`).
- **Tầng 4 (`app.js`):** `js/app.js` (`initApp`, `switchView` + Auth Guard, Event Delegation).
- **Edge Functions:** `supabase/functions/_shared/payos.ts`, `supabase/functions/create-order/index.ts`, `supabase/functions/payment-webhook/index.ts`, `supabase/functions/admin-api/index.ts`.
