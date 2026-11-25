/**
 * js/ui/uiAdminStats.js — Render Báo cáo Thống kê nhanh trong Admin Kho (#view-admin)
 */
import { formatVnd, escapeHtml } from './uiCommon.js';

function countLowStockItems(products = []) {
  let count = 0;
  products.forEach((p) => {
    const vs = Object.values(p.variantStocks || {});
    if (vs.length > 0) count += vs.filter((qty) => Number(qty) <= 2).length;
    else if (Number(p.stock) <= 2) count += 1;
  });
  return count;
}

function renderTopList(title, entries, emptyText) {
  const rowsHtml =
    entries.length > 0
      ? entries
          .map(
            ([label, sub, right]) => `
            <div style="display:flex;justify-content:space-between;gap:0.5rem;font-size:0.82rem;padding:0.35rem 0;border-bottom:1px solid var(--color-border);">
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>${escapeHtml(label)}</strong> <span class="section-subtitle">${escapeHtml(sub)}</span></span>
              <strong style="flex-shrink:0;">${escapeHtml(right)}</strong>
            </div>`
          )
          .join('')
      : `<p class="section-subtitle">${escapeHtml(emptyText)}</p>`;
  return `<div class="panel-card" style="padding:0.85rem;"><h4 style="margin:0 0 0.5rem;font-size:0.9rem;">${escapeHtml(title)}</h4>${rowsHtml}</div>`;
}

export function renderAdminStats(products = [], orders = []) {
  const cardsEl = document.getElementById('admin-stats-cards');
  const breakEl = document.getElementById('admin-stats-breakdown');
  if (!cardsEl || !breakEl) return;

  const list = Array.isArray(orders) ? orders : [];
  const todayStr = new Date().toLocaleDateString('en-CA');
  const paidOrders = list.filter((o) => String(o.status || '').toLowerCase() === 'paid');
  const totalRevenue = paidOrders.reduce((s, o) => s + (Number(o.amount ?? o.totalAmount) || 0), 0);
  const todayRevenue = paidOrders
    .filter((o) => o.created_at && new Date(o.created_at).toLocaleDateString('en-CA') === todayStr)
    .reduce((s, o) => s + (Number(o.amount ?? o.totalAmount) || 0), 0);
  const convRate = list.length > 0 ? Math.round((paidOrders.length / list.length) * 100) : 0;
  const lowStockCount = countLowStockItems(products);

  cardsEl.innerHTML = [
    ['Doanh thu hôm nay', formatVnd(todayRevenue), 'Đơn đã thanh toán hôm nay', ''],
    ['Tổng doanh thu (PAID)', formatVnd(totalRevenue), `${paidOrders.length} đơn thành công`, 'text-secondary'],
    ['Tỷ lệ chốt đơn', `${paidOrders.length}/${list.length} (${convRate}%)`, 'Đơn thanh toán / tổng tạo', ''],
    ['Cảnh báo sắp hết kho', `${lowStockCount} biến thể`, 'Tồn kho <= 2 key', lowStockCount > 0 ? 'text-error' : 'text-secondary'],
  ]
    .map(
      ([label, val, note, cls]) => `
      <div class="stat-card" style="padding:0.85rem;">
        <div class="stat-content">
          <span class="stat-label">${label}</span>
          <strong class="stat-value ${cls}" style="font-size:1.2rem;">${val}</strong>
          <span class="stat-note">${note}</span>
        </div>
      </div>`
    )
    .join('');

  const srcMap = new Map();
  const prodMap = new Map();
  const custMap = new Map();

  list.forEach((o) => {
    const src = o.traffic_source || 'Direct';
    const isPaid = String(o.status || '').toLowerCase() === 'paid';
    const amt = isPaid ? Number(o.amount ?? o.totalAmount) || 0 : 0;
    const curSrc = srcMap.get(src) || { orders: 0, rev: 0 };
    curSrc.orders += 1;
    curSrc.rev += amt;
    srcMap.set(src, curSrc);

    if (isPaid) {
      const pName = o.product_name || o.product_id || 'Gói';
      const curProd = prodMap.get(pName) || { qty: 0, rev: 0 };
      curProd.qty += Math.max(1, Number(o.quantity) || 1);
      curProd.rev += amt;
      prodMap.set(pName, curProd);

      const contact = o.contact || 'Ẩn danh';
      const curCust = custMap.get(contact) || { orders: 0, rev: 0 };
      curCust.orders += 1;
      curCust.rev += amt;
      custMap.set(contact, curCust);
    }
  });

  const srcEntries = [...srcMap.entries()]
    .sort((a, b) => b[1].rev - a[1].rev || b[1].orders - a[1].orders)
    .slice(0, 6)
    .map(([k, v]) => [k, `(${v.orders} đơn)`, formatVnd(v.rev)]);
  const prodEntries = [...prodMap.entries()]
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 5)
    .map(([k, v]) => [k, `(x${v.qty})`, formatVnd(v.rev)]);
  const custEntries = [...custMap.entries()]
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 5)
    .map(([k, v]) => [k, `(${v.orders} đơn)`, formatVnd(v.rev)]);

  breakEl.innerHTML = [
    renderTopList('Nguồn khách truy cập', srcEntries, 'Chưa có dữ liệu nguồn đơn.'),
    renderTopList('Top sản phẩm bán chạy', prodEntries, 'Chưa có đơn đã thanh toán.'),
    renderTopList('Khách hàng chi tiêu cao', custEntries, 'Chưa có dữ liệu khách hàng.'),
  ].join('');
}
