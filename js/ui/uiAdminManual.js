/**
 * js/ui/uiAdminManual.js — Xử lý cấu hình số lượng cấp thủ công theo biến thể
 */
import { fetchProducts } from '../services/supabaseApi.js';
import { adminUpdateManualStock } from '../services/adminManualApi.js';
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

