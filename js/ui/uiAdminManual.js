/**
 * js/ui/uiAdminManual.js — Xử lý cấu hình cấp thủ công & hoàn tất đơn thủ công
 */
import { fetchProducts } from '../services/supabaseApi.js';
import { adminListOrders } from '../services/adminApi.js';
import { adminUpdateManualStock, adminCompleteManualOrder } from '../services/adminManualApi.js';
import { renderAdminOrders } from './uiAdminRender.js';
import { showToast } from './uiCommon.js';

export async function handleEditManualStock(btn, state, refreshCatalogUi) {
  const vKey = btn.dataset.variantKey || '';
  const curQty = Number(btn.dataset.manualStock || 0);
  const raw = window.prompt(
    `Nhập số lượng nhận đơn Cấp thủ công cho "${vKey.replace('|', ' • ')}" (nhập 0 để tắt):`,
    String(curQty)
  );
  if (raw === null) return;
  const nextQty = Math.max(0, Number.parseInt(raw.replace(/[^\d]/g, ''), 10) || 0);
  try {
    await adminUpdateManualStock(btn.dataset.id, vKey, nextQty);
    state.products = await fetchProducts();
    refreshCatalogUi();
    showToast(
      nextQty > 0
        ? `Đã bật Cấp thủ công (${nextQty} suất) cho ${vKey.replace('|', ' • ')}.`
        : `Đã tắt Cấp thủ công cho ${vKey.replace('|', ' • ')}.`,
      'success'
    );
  } catch (err) {
    showToast(err.message || 'Không thể cập nhật cấp thủ công.', 'error');
  }
}

export async function handleAddManualVariant(btn, state, refreshCatalogUi) {
  const productName = btn.dataset.name || 'gói';
  const vKeyRaw = window.prompt(
    `Nhập phân loại cho "${productName}" theo mẫu Thời hạn|Loại tài khoản:`,
    '1 Tháng|Nâng cấp chính chủ'
  );
  if (!vKeyRaw || !vKeyRaw.includes('|')) {
    if (vKeyRaw !== null) showToast('Định dạng phải là Thời hạn|Loại tài khoản.', 'error');
    return;
  }
  const vKey = vKeyRaw.split('|').map((s) => s.trim()).slice(0, 2).join('|');
  const priceRaw = window.prompt(`Nhập giá bán cho "${vKey.replace('|', ' • ')}" (VNĐ, >= 1000):`, '60000');
  if (priceRaw === null) return;
  const price = Math.round(Number(priceRaw.replace(/[^\d]/g, '')) || 0);
  if (price < 1000) return showToast('Giá bán phải từ 1.000đ trở lên.', 'error');

  const qtyRaw = window.prompt(`Nhập số suất Cấp thủ công cho "${vKey.replace('|', ' • ')}" (nhập 0 nếu chỉ đặt giá):`, '10');
  if (qtyRaw === null) return;
  const qty = Math.max(0, Number.parseInt(qtyRaw.replace(/[^\d]/g, ''), 10) || 0);

  try {
    await adminUpdateManualStock(btn.dataset.id, vKey, qty, price);
    state.products = await fetchProducts();
    refreshCatalogUi();
    showToast(`Đã cấu hình ${vKey.replace('|', ' • ')} (${qty} suất thủ công).`, 'success');
  } catch (err) {
    showToast(err.message || 'Không thể cấu hình biến thể.', 'error');
  }
}

export async function handleCompleteManualOrder(btn) {
  const orderCode = btn.dataset.orderCode || '';
  if (!orderCode) return;
  const cred = window.prompt(
    `Nhập thông tin bàn giao / ghi chú hoàn tất cho đơn #${orderCode}:`,
    'Đã kích hoạt chính chủ qua Email / Zalo'
  );
  if (!cred || !cred.trim()) return;
  btn.disabled = true;
  try {
    await adminCompleteManualOrder(orderCode, cred.trim());
    renderAdminOrders(await adminListOrders());
    showToast(`Đã hoàn tất & bàn giao đơn #${orderCode}!`, 'success');
  } catch (err) {
    showToast(err.message || 'Không thể hoàn tất đơn thủ công.', 'error');
    btn.disabled = false;
  }
}
