/**
 * js/ui/uiAdminRender.js — Render giao diện Quản trị Admin Kho (#view-admin)
 */
import { isSupabaseConfigured } from '../config/config.js';
import { getAdminSession } from '../services/adminApi.js';
import { formatVnd, escapeHtml } from './uiCommon.js';
import { renderAdminStats } from './uiAdminStats.js';

const ADMIN_TABS = ['stats', 'products', 'inventory', 'orders'];
let activeAdminTab = 'stats';

export function switchAdminTab(tabKey = 'stats') {
  const nextTab = ADMIN_TABS.includes(tabKey) ? tabKey : 'stats';
  activeAdminTab = nextTab;
  ADMIN_TABS.forEach((key) => {
    const panel = document.getElementById(`admin-tab-${key}`);
    if (panel) panel.hidden = key !== nextTab;
  });
  document.querySelectorAll('#admin-sidebar-nav [data-admin-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.adminTab === nextTab);
  });
}

export function syncImportPriceInput(products = []) {
  const pid = document.getElementById('admin-import-product')?.value || '';
  const dur = document.getElementById('admin-import-duration')?.value || '1 Tháng';
  const type = document.getElementById('admin-import-type')?.value || 'Tài khoản riêng';
  const priceEl = document.getElementById('admin-import-price');
  if (!priceEl) return;
  const prod = products.find((p) => p.id === pid);
  const vPrice = Number(prod?.variantPrices?.[`${dur}|${type}`] || 0);
  priceEl.value = vPrice >= 1000 ? String(vPrice) : '';
}

export function renderAdminOrders(orders = []) {
  const container = document.getElementById('admin-orders-list');
  if (!container) return;

  if (!Array.isArray(orders) || orders.length === 0) {
    container.innerHTML = `<div class="empty-state">Chưa có đơn hàng tự động nào gần đây.</div>`;
    return;
  }

  container.innerHTML = orders
    .map((o) => {
      const code = o.order_code || o.orderCode;
      const name = o.product_name || o.productName;
      const duration = o.duration || '1 Tháng';
      const accountType = o.account_type || o.accountType || 'Tài khoản riêng';
      const amount = o.amount ?? o.totalAmount ?? 0;
      const statusVal = String(o.status || 'pending').toLowerCase();
      const isPaid = statusVal === 'paid';
      const isManual = statusVal === 'pending_manual';
      const statusText = isPaid ? 'Đã giao tự động' : isManual ? 'Chờ cấp thủ công' : 'Chờ thanh toán';
      const cred = o.delivered_credential || '';
      return `
        <div class="admin-stock-row">
          <div>
            <strong class="order-code">#${escapeHtml(code)}</strong> • ${escapeHtml(name)}
            <div class="section-subtitle">${escapeHtml(duration)} • ${escapeHtml(accountType)} • ${escapeHtml(o.contact)} • ${formatVnd(amount)}</div>
          </div>
          <div class="admin-stock-controls">
            <span class="card-stock ${isPaid ? '' : 'is-low'}">${statusText}</span>
            ${isManual ? `<button type="button" class="btn btn-secondary" data-action="complete-manual-order" data-order-code="${escapeHtml(code)}">Giao key / Hoàn tất</button>` : ''}
            ${isPaid && cred ? `<button type="button" class="copy-btn" data-copy-raw="${escapeHtml(cred)}">Copy key</button>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderAdminPromos(promos = [], products = []) {
  const container = document.getElementById('admin-promos-list');
  if (!container) return;
  if (!Array.isArray(promos) || promos.length === 0) {
    container.innerHTML = `<div class="empty-state">Chưa có mã giảm giá nào.</div>`;
    return;
  }
  container.innerHTML = promos
    .map((pm) => {
      const isActive = pm.is_active !== false;
      const valText = pm.discount_type === 'percent' ? `${pm.discount_value}%` : formatVnd(pm.discount_value);
      const prodName = pm.product_id
        ? products.find((p) => p.id === pm.product_id)?.name || pm.product_id
        : 'Toàn shop';
      const durText = pm.duration || 'Mọi thời hạn';
      return `
        <div class="admin-stock-row">
          <div>
            <strong class="order-code">${escapeHtml(pm.code)}</strong> • Giảm ${escapeHtml(valText)}
            <div class="section-subtitle">Áp dụng: ${escapeHtml(prodName)} • ${escapeHtml(durText)}</div>
          </div>
          <div class="admin-stock-controls">
            <button type="button" class="btn ${isActive ? 'btn-secondary' : 'btn-ghost'}" data-action="toggle-promo" data-id="${escapeHtml(pm.id)}" data-active="${isActive}">
              ${isActive ? 'Đang bật' : 'Đã tắt'}
            </button>
            <button type="button" class="btn btn-ghost text-error" data-action="delete-promo" data-id="${escapeHtml(pm.id)}" data-code="${escapeHtml(pm.code)}">Xóa</button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderAdminView(products, orders = null, promos = null) {
  switchAdminTab(activeAdminTab);
  const isLive = isSupabaseConfigured();
  const session = getAdminSession();
  const statusEl = document.getElementById('admin-auth-status');
  if (statusEl) {
    statusEl.textContent = session?.isAdmin
      ? `Phiên Quản trị viên Supabase: ${session.email}`
      : 'Chưa xác thực quyền Admin.';
  }

  const headingEl = document.getElementById('admin-heading');
  if (headingEl) headingEl.textContent = isLive ? 'Thêm Gói Tài Khoản Mới' : 'Thêm Gói Tài Khoản Mới (Demo)';

  const resetBtn = document.getElementById('admin-reset-btn');
  if (resetBtn) resetBtn.hidden = isLive;

  if (isLive) {
    const importSub = document.querySelector('#admin-import-form')?.previousElementSibling?.querySelector('.section-subtitle');
    if (importSub) importSub.innerHTML = 'Dữ liệu được lưu bảo mật vào bảng <code>inventory_keys</code> trên Supabase.';
  }

  const importSelect = document.getElementById('admin-import-product');
  if (importSelect) {
    const prev = importSelect.value || '';
    importSelect.innerHTML = products
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (Tồn: ${p.stock})</option>`)
      .join('');
    if (prev && products.some((p) => p.id === prev)) importSelect.value = prev;
  }
  const promoSelect = document.getElementById('admin-promo-product');
  if (promoSelect) {
    const prevPromo = promoSelect.value || '';
    promoSelect.innerHTML = `<option value="">Toàn bộ cửa hàng</option>${products
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
      .join('')}`;
    if (prevPromo && products.some((p) => p.id === prevPromo)) promoSelect.value = prevPromo;
  }
  syncImportPriceInput(products);

  const stockList = document.getElementById('admin-stock-list');
  if (stockList) {
    stockList.innerHTML = products
      .map((p) => {
        const isActive = p.isActive !== false;
        const stockClass = p.stock === 0 ? 'is-empty' : p.stock <= 5 ? 'is-low' : '';
        const vp = p.variantPrices || {};
        const vs = p.variantStocks || {};
        const ms = p.manualStocks || {};
        const allKeys = [...new Set([...Object.keys(vp), ...Object.keys(vs), ...Object.keys(ms)])];
        const variantHtml =
          allKeys.length > 0
            ? allKeys
                .map((key) => {
                  const [dur = '1 Tháng', type = 'Tài khoản riêng'] = key.split('|');
                  const qty = Number(vs[key] || 0);
                  const manualQty = Math.max(0, Number(ms[key] || 0));
                  const customPrice = Number(vp[key] || 0);
                  const priceText = customPrice >= 1000 ? formatVnd(customPrice) : 'Giá mặc định';
                  const manualBadge = manualQty > 0 ? ` • Thủ công: ${manualQty}` : '';
                  return `
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.35rem;font-size:0.8rem;">
                      <span class="card-stock ${qty === 0 && manualQty === 0 ? 'is-empty' : qty + manualQty <= 2 ? 'is-low' : ''}">${escapeHtml(dur)} • ${escapeHtml(type)}: ${qty} key${manualBadge} (${priceText})</span>
                      <button type="button" class="copy-btn" data-action="edit-variant-price" data-id="${escapeHtml(p.id)}" data-variant-key="${escapeHtml(key)}" data-price="${customPrice || p.price}">Sửa giá</button>
                      <button type="button" class="copy-btn" data-action="edit-manual-stock" data-id="${escapeHtml(p.id)}" data-variant-key="${escapeHtml(key)}" data-manual-stock="${manualQty}">Cấp thủ công</button>
                      <button type="button" class="copy-btn" data-action="quick-import" data-id="${escapeHtml(p.id)}" data-duration="${escapeHtml(dur)}" data-account-type="${escapeHtml(type)}">+ Nạp</button>
                    </div>`;
                })
                .join('')
            : '<span class="section-subtitle">Chưa cấu hình biến thể hoặc key trong kho</span>';
        return `
        <div class="admin-stock-row">
          <div style="flex:1;min-width:220px;">
            <strong>${escapeHtml(p.name)}</strong>
            <div class="section-subtitle">${escapeHtml(p.category)} • Giá từ ${formatVnd(p.price)} • ${escapeHtml(p.warranty)}</div>
            <div style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.45rem;">${variantHtml}</div>
          </div>
          <div class="admin-stock-controls">
            <span class="card-stock ${stockClass}">Tổng kho: ${p.stock} key</span>
            <button type="button" class="btn btn-ghost" data-action="add-manual-variant" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">+ Biến thể / Thủ công</button>
            <button type="button" class="btn btn-ghost" data-action="edit-warranty" data-id="${escapeHtml(p.id)}" data-warranty="${escapeHtml(p.warranty)}">Sửa bảo hành</button>
            <button type="button" class="btn btn-ghost" data-action="edit-price" data-id="${escapeHtml(p.id)}" data-price="${p.price}">Sửa giá gốc</button>
            <button type="button" class="btn ${isActive ? 'btn-secondary' : 'btn-ghost'}" data-action="toggle-active" data-id="${escapeHtml(p.id)}" data-active="${isActive}">
              ${isActive ? 'Đang bán' : 'Tạm ẩn'}
            </button>
            <button type="button" class="btn btn-ghost text-error" data-action="delete-product" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">Xóa</button>
          </div>
        </div>`;
      })
      .join('');
  }

  if (orders !== null) {
    renderAdminOrders(orders);
    renderAdminStats(products, orders);
  }
  if (promos !== null) renderAdminPromos(promos, products);
}
