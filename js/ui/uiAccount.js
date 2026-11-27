/**
 * js/ui/uiAccount.js — Render Trang Tài khoản (#view-account)
 */
import { getAdminSession, isAdminLoggedIn, isUserLoggedIn } from '../services/adminApi.js';
import { formatVnd, escapeHtml, formatDateTime, getInitials } from './uiCommon.js';

export function syncAuthNavUi() {
  const isAdmin = isAdminLoggedIn();
  const isLoggedIn = isUserLoggedIn();
  document.querySelectorAll('[data-tab="admin"]').forEach((btn) => {
    btn.hidden = !isAdmin;
  });
  document.querySelectorAll('[data-tab="my-orders"]').forEach((btn) => {
    btn.hidden = !isLoggedIn;
  });
}

export function renderAccountView(profile, orders = [], defaultTab = 'overview') {
  if (!profile) return;

  const session = getAdminSession();
  const displayName = session?.name || profile.name || 'Khách hàng';
  const displayEmail = session?.email || profile.email || '';
  const tierLabel = session?.isAdmin
    ? 'Quản trị viên Admin'
    : session?.isDemo
      ? 'Khách dùng thử Demo'
      : profile.tier || 'Thành viên Bạc';

  const avatarEl = document.getElementById('acc-sidebar-avatar');
  const sideName = document.getElementById('acc-sidebar-name');
  const sideEmail = document.getElementById('acc-sidebar-email');
  const sideCount = document.getElementById('acc-sidebar-order-count');
  const welcomeTitle = document.getElementById('account-welcome-title');
  const memberTier = document.getElementById('acc-member-tier');
  const welcomeMeta = document.getElementById('acc-welcome-meta');
  const profileCard = document.getElementById('acc-profile-card');

  if (profileCard) profileCard.hidden = true;
  if (avatarEl) avatarEl.textContent = getInitials(displayName);
  if (sideName) sideName.textContent = displayName;
  if (sideEmail) sideEmail.textContent = displayEmail;
  if (sideCount) sideCount.textContent = `${orders.length} đơn`;
  if (welcomeTitle) welcomeTitle.textContent = `Xin chào, ${displayName} 👋`;
  if (memberTier) memberTier.textContent = tierLabel;
  if (welcomeMeta) {
    const phonePart = profile.phone ? ` • Zalo: ${profile.phone}` : '';
    welcomeMeta.textContent = `${displayEmail}${phonePart} • Tham gia: ${profile.joinedAt || '12/02/2026'}`;
  }

  const inputName = document.getElementById('acc-input-name');
  const inputEmail = document.getElementById('acc-input-email');
  const inputPhone = document.getElementById('acc-input-phone');
  if (inputName) inputName.value = displayName;
  if (inputEmail) inputEmail.value = displayEmail;
  if (inputPhone) inputPhone.value = profile.phone || '';

  const tabOverview = document.getElementById('acc-tab-overview');
  const tabOrders = document.getElementById('acc-tab-orders');
  const showOrders = defaultTab === 'orders';
  if (tabOverview) tabOverview.hidden = showOrders;
  if (tabOrders) tabOrders.hidden = !showOrders;
  document.getElementById('acc-nav-overview')?.classList.toggle('is-active', !showOrders);
  document.getElementById('acc-nav-orders')?.classList.toggle('is-active', showOrders);
  document.getElementById('acc-nav-profile')?.classList.remove('is-active');

  const paidOrders = orders.filter((o) => {
    const st = String(o.status || 'PAID').toUpperCase();
    return st === 'PAID' || st === 'PENDING_MANUAL';
  });
  const totalPaidAmount = paidOrders.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
  const totalKeys = paidOrders.reduce(
    (sum, item) =>
      sum +
      (Array.isArray(item.credentials) && item.credentials.length > 0
        ? item.credentials.length
        : Number(item.quantity) || 1),
    0
  );
  const statOrdersEl = document.getElementById('acc-stat-orders');
  const statKeysEl = document.getElementById('acc-stat-keys');
  if (statOrdersEl) statOrdersEl.textContent = formatVnd(totalPaidAmount);
  if (statKeysEl) statKeysEl.textContent = `${String(totalKeys).padStart(2, '0')} tài khoản`;

  const tbody = document.getElementById('account-orders-tbody');
  if (!tbody) return;

  const searchQ = (document.getElementById('account-order-search')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('account-order-status-filter')?.value || 'all';
  const filteredOrders = orders.filter((o) => {
    const st = String(o.status || 'PAID').toUpperCase();
    const matchStatus = statusFilter === 'all' || st === statusFilter;
    const matchQ =
      !searchQ ||
      String(o.orderCode || '').toLowerCase().includes(searchQ) ||
      String(o.productName || '').toLowerCase().includes(searchQ) ||
      String(o.contact || '').toLowerCase().includes(searchQ);
    return matchStatus && matchQ;
  });

  if (filteredOrders.length === 0) {
    tbody.innerHTML = `
      <tr class="acc-empty-row">
        <td colspan="5" class="empty-state">
          ${orders.length === 0 ? 'Tài khoản của bạn chưa có đơn hàng nào. Hãy chọn một gói ngoài Cửa hàng để nhận tài khoản tức thì!' : 'Không tìm thấy đơn hàng phù hợp với bộ lọc.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredOrders
    .map((order) => {
      const credText = Array.isArray(order.credentials) ? order.credentials.join('\n') : '';
      const isManual = String(order.status || '').toUpperCase() === 'PENDING_MANUAL';
      const statusBadge = isManual
        ? '<span class="acc-status-badge">Đang chờ cấp key</span>'
        : '<span class="acc-status-badge"><span class="pulse-dot" aria-hidden="true"></span>Đã bàn giao</span>';
      const credCell = isManual
        ? `<div class="acc-order-sub">Đã nhận tiền • Liên hệ <a href="https://zalo.me/0373786203" target="_blank" rel="noopener noreferrer">Zalo 0373786203</a> / <a href="https://t.me/Acc2Hand" target="_blank" rel="noopener noreferrer">Telegram @Acc2Hand</a> kèm mã <strong>#${escapeHtml(order.orderCode)}</strong> để kích hoạt ngay.</div>`
        : `<div class="acc-cred-pill">
              <code>${escapeHtml(credText)}</code>
              <button type="button" class="copy-btn" data-copy-raw="${escapeHtml(credText)}" title="Sao chép tài khoản">
                <svg class="icon" aria-hidden="true"><use href="#icon-copy" /></svg>
                <span>Copy</span>
              </button>
            </div>`;
      return `
        <tr>
          <td data-label="Mã đơn & Ngày">
            <span class="acc-order-code">#${escapeHtml(order.orderCode)}</span>
            <span class="acc-order-date">${escapeHtml(formatDateTime(order.paidAt || order.createdAt))}</span>
          </td>
          <td data-label="Sản phẩm & Gói">
            <div class="acc-order-product">${escapeHtml(order.productName)}</div>
            <div class="acc-order-sub">SL: ${order.quantity} • ${formatVnd(order.totalAmount)} • Nhận: ${escapeHtml(order.contact)}</div>
          </td>
          <td data-label="Trạng thái">
            ${statusBadge}
          </td>
          <td data-label="Tài khoản / Mã kích hoạt">
            ${credCell}
          </td>
          <td data-label="Thao tác">
            <div class="acc-row-actions">
              <button type="button" class="btn btn-ghost btn-detail" data-action="buy-again" data-product-id="${escapeHtml(order.productId)}">Mua thêm</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}
