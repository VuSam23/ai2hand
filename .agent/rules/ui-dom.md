# Luật UI & DOM (`.agent/rules/ui-dom.md`)

1. **Bảo toàn DOM ID & Hook:** Không đổi hoặc xóa `id`, `data-tab`, `data-view`, `data-action` đang được JS tham chiếu (`verify.mjs` sẽ báo lỗi nếu lệch).
2. **Chống XSS:** Mọi dữ liệu người dùng hoặc từ API trước khi chèn vào `innerHTML` phải qua `escapeHtml()` hoặc ưu tiên `.textContent`.
3. **Không gắn sự kiện lặp:** Tuyệt đối không gọi `addEventListener` bên trong các hàm `render*()`. Dùng Event Delegation ở container cha.
4. **Thông báo & Hộp thoại:** Cấm `alert()`, `confirm()`, `prompt()`. Mọi phản hồi dùng `showToast(msg, type)`.
5. **Mobile-First (`< 768px`):**
   - Không để tràn ngang (`overflow-x`).
   - Bảng lịch sử đơn chuyển sang Card dọc (`css/mobile.css`); Modal hiển thị dạng Bottom Sheet (`max-height: 90dvh`); nút bấm tối thiểu `44px`.
   - Không ẩn các tab quan trọng sai trạng thái (dùng thuộc tính `[hidden]` với `!important` trong `tokens.css`).
