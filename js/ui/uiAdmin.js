/**
 * js/ui/uiAdmin.js — Sự kiện & Điều phối trang Quản trị Admin Kho (#view-admin)
 */
import { fetchProducts } from '../services/supabaseApi.js';
import { uploadProductIcon } from '../services/imageUpload.js';
import { adminUpdateManualStock } from '../services/adminManualApi.js';
import {
  adminAddProduct,
  adminUpdateVariantPrice,
  adminImportCredentials,
  adminListPromos,
  adminUpsertPromo,
  adminTogglePromo,
  adminDeletePromo,
  resetDemoData,
} from '../services/adminApi.js';
import { showToast, copyText } from './uiCommon.js';
import { openConfirmDialog } from './uiDialog.js';
import { renderAdminOrders, renderAdminPromos, renderAdminView, syncImportPriceInput, switchAdminTab } from './uiAdminRender.js';
import {
  handleEditManualStock,
  handleAddManualVariant,
  handleCompleteManualOrder,
  handleEditWarranty,
  handleEditProduct,
  refreshAdminKeys,
  handleDeleteKey,
  handlePriceDialog,
  handleProductAction,
} from './uiAdminManual.js';

export { renderAdminOrders, renderAdminPromos, renderAdminView, switchAdminTab };

export function bindAdminEvents({ state, refreshCatalogUi, refreshAccountData }) {
  document.getElementById('admin-sidebar-nav')?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-admin-tab]');
    if (!tabBtn) return;
    switchAdminTab(tabBtn.dataset.adminTab);
    if (tabBtn.dataset.adminTab === 'inventory') refreshAdminKeys(state);
  });
  const renderImagePreview = (url = '', boxId = 'admin-image-preview', fallback = 'IMG') => {
    const box = document.getElementById(boxId);
    if (!box) return;
    if (/^https?:\/\//i.test(url.trim())) {
      box.innerHTML = `<img class="product-logo-img" src="${url.trim().replace(/"/g, '&quot;')}" alt="Preview" onerror="this.parentElement.textContent='${fallback}'" />`;
    } else {
      box.textContent = fallback;
    }
  };

  const bindImagePicker = (urlId, fileId, previewId, fallback, maxSize, prefix, label) => {
    document.getElementById(urlId)?.addEventListener('input', (e) => {
      renderImagePreview(e.target.value, previewId, fallback);
    });
    document.getElementById(fileId)?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const urlInput = document.getElementById(urlId);
      e.target.disabled = true;
      try {
        showToast(`Đang nén & tải ${label} lên kho...`, 'info');
        const publicUrl = await uploadProductIcon(file, maxSize, prefix);
        if (urlInput) urlInput.value = publicUrl;
        renderImagePreview(publicUrl, previewId, fallback);
        showToast(`Đã tải ${label} thành công!`, 'success');
      } catch (err) {
        showToast(err.message || 'Không thể tải ảnh lên Storage.', 'error');
      } finally {
        e.target.disabled = false;
        e.target.value = '';
      }
    });
  };

  bindImagePicker('admin-image-url', 'admin-image-file', 'admin-image-preview', 'IMG', 256, 'icon', 'ảnh đại diện');
  bindImagePicker('admin-detail-image-url', 'admin-detail-image-file', 'admin-detail-image-preview', 'BANNER', 1280, 'banner', 'ảnh banner chi tiết');

  document.getElementById('admin-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const created = await adminAddProduct({
        name: document.getElementById('admin-name').value,
        category: document.getElementById('admin-category').value,
        price: 0,
        description: document.getElementById('admin-desc').value,
        warranty: document.getElementById('admin-warranty')?.value.trim() || 'Bảo hành 1 đổi 1 trọn kỳ',
        image_url: document.getElementById('admin-image-url')?.value.trim() || '',
        detail_image_url: document.getElementById('admin-detail-image-url')?.value.trim() || '',
      });
      state.products = await fetchProducts();
      refreshCatalogUi();
      e.target.reset();
      renderImagePreview('', 'admin-image-preview', 'IMG');
      renderImagePreview('', 'admin-detail-image-preview', 'BANNER');
      showToast(`Đã tạo gói "${created.name}"! Hãy nạp kho & đặt giá biến thể bên cạnh.`, 'success');
    } catch (err) {
      showToast(err.message || 'Không thể thêm gói mới.', 'error');
    }
  });

  ['admin-import-product', 'admin-import-duration', 'admin-import-type'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('change', () => syncImportPriceInput(state.products));
    if (id === 'admin-import-duration') el?.addEventListener('input', () => syncImportPriceInput(state.products));
  });

  document.getElementById('admin-import-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const selectEl = document.getElementById('admin-import-product');
      const productId = selectEl?.value?.trim() || '';
      if (!productId) return showToast('Vui lòng chọn gói sản phẩm cần nạp kho.', 'error');

      const duration = (document.getElementById('admin-import-duration')?.value || '').replace(/\|/g, '-').trim() || '1 Tháng';
      const accountType = document.getElementById('admin-import-type')?.value || 'TK cấp sẵn';
      const variantPrice = Math.round(Number(document.getElementById('admin-import-price')?.value) || 0);
      if (accountType === 'Dùng chung' || accountType === 'Nâng cấp chính chủ') {
        const manualQty = Math.max(0, Number.parseInt(document.getElementById('admin-import-manual-qty')?.value, 10) || 0);
        await adminUpdateManualStock(productId, `${duration}|${accountType}`, manualQty, variantPrice);
        state.products = await fetchProducts();
        refreshCatalogUi();
        if (selectEl) selectEl.value = productId;
        syncImportPriceInput(state.products);
        showToast(`Đã lưu ${manualQty} suất mở bán (${duration} • ${accountType}) — khách tự nhập Gmail, không cần nạp user|pass!`, 'success');
        return;
      }
      const res = await adminImportCredentials(
        productId,
        document.getElementById('admin-import-lines').value,
        duration,
        accountType
      );
      if (variantPrice >= 1000) {
        await adminUpdateVariantPrice(productId, `${duration}|${accountType}`, variantPrice);
      }
      state.products = await fetchProducts();
      refreshCatalogUi();
      await refreshAdminKeys(state);
      if (selectEl) selectEl.value = productId;
      syncImportPriceInput(state.products);
      document.getElementById('admin-import-lines').value = '';
      const dupNote = res.duplicateCount > 0 ? ` (bỏ qua ${res.duplicateCount} key trùng)` : '';
      showToast(
        `Đã nạp ${res.importedCount} key mới${dupNote} (${duration} • ${accountType}). Tổng kho: ${res.updatedStock}.`,
        res.importedCount > 0 ? 'success' : 'info'
      );
    } catch (err) {
      showToast(err.message || 'Lỗi nạp kho.', 'error');
    }
  });

  document.getElementById('admin-stock-list')?.addEventListener('click', async (e) => {
    const quickBtn = e.target.closest('[data-action="quick-import"]');
    if (quickBtn) {
      const pSel = document.getElementById('admin-import-product');
      const dSel = document.getElementById('admin-import-duration');
      const tSel = document.getElementById('admin-import-type');
      const lines = document.getElementById('admin-import-lines');
      if (pSel) pSel.value = quickBtn.dataset.id;
      if (dSel) dSel.value = quickBtn.dataset.duration;
      if (tSel) tSel.value = quickBtn.dataset.accountType;
      syncImportPriceInput(state.products);
      switchAdminTab('inventory');
      lines?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lines?.focus();
      return;
    }

    const editVarBtn = e.target.closest('[data-action="edit-variant-price"]');
    if (editVarBtn) return handlePriceDialog(editVarBtn, state, refreshCatalogUi, true);
    const editManualBtn = e.target.closest('[data-action="edit-manual-stock"]');
    if (editManualBtn) return handleEditManualStock(editManualBtn, state, refreshCatalogUi);
    const addManualBtn = e.target.closest('[data-action="add-manual-variant"]');
    if (addManualBtn) return handleAddManualVariant(addManualBtn, state, refreshCatalogUi);
    const warrantyBtn = e.target.closest('[data-action="edit-warranty"]');
    if (warrantyBtn) return handleEditWarranty(warrantyBtn, state, refreshCatalogUi);
    const editProdBtn = e.target.closest('[data-action="edit-product"]');
    if (editProdBtn) return handleEditProduct(editProdBtn, state, refreshCatalogUi);
    const toggleBtn = e.target.closest('[data-action="toggle-active"]');
    if (toggleBtn) return handleProductAction(toggleBtn, state, refreshCatalogUi, false);
    const editBtn = e.target.closest('[data-action="edit-price"]');
    if (editBtn) return handlePriceDialog(editBtn, state, refreshCatalogUi, false);
    const delBtn = e.target.closest('[data-action="delete-product"]');
    if (delBtn) return handleProductAction(delBtn, state, refreshCatalogUi, true);
  });

  document.getElementById('admin-order-search')?.addEventListener('input', () => renderAdminOrders());
  document.getElementById('admin-order-status-filter')?.addEventListener('change', () => renderAdminOrders());
  document.getElementById('admin-keys-filter')?.addEventListener('change', () => refreshAdminKeys(state));
  document.getElementById('admin-refresh-keys-btn')?.addEventListener('click', () => refreshAdminKeys(state));
  document.getElementById('admin-keys-list')?.addEventListener('click', (e) => {
    const delKeyBtn = e.target.closest('[data-action="delete-key"]');
    if (delKeyBtn) handleDeleteKey(delKeyBtn, state, refreshCatalogUi);
  });

  document.getElementById('admin-orders-list')?.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy-raw]');
    if (copyBtn) return copyText(copyBtn.dataset.copyRaw, 'tài khoản', copyBtn);
    const completeBtn = e.target.closest('[data-action="complete-manual-order"]');
    if (completeBtn) handleCompleteManualOrder(completeBtn);
  });

  document.getElementById('admin-promo-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const code = document.getElementById('admin-promo-code').value.trim().toUpperCase();
      const discountType = document.getElementById('admin-promo-type').value;
      const discountValue = Math.round(Number(document.getElementById('admin-promo-value').value) || 0);
      const productId = document.getElementById('admin-promo-product').value || null;
      const duration = (document.getElementById('admin-promo-duration')?.value || '').replace(/\|/g, '-').trim() || null;
      if (discountType === 'percent' && (discountValue < 1 || discountValue > 100)) {
        return showToast('Giảm giá theo % phải từ 1 đến 100.', 'error');
      }
      if (discountType === 'fixed' && discountValue < 1000) {
        return showToast('Giảm giá cố định phải từ 1.000đ trở lên.', 'error');
      }
      await adminUpsertPromo({ code, discount_type: discountType, discount_value: discountValue, product_id: productId, duration });
      renderAdminPromos(await adminListPromos(), state.products);
      e.target.reset();
      showToast(`Đã lưu mã giảm giá "${code}"!`, 'success');
    } catch (err) {
      showToast(err.message || 'Không thể lưu mã giảm giá.', 'error');
    }
  });

  document.getElementById('admin-promos-list')?.addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-action="toggle-promo"]');
    if (toggleBtn) {
      toggleBtn.disabled = true;
      try {
        await adminTogglePromo(toggleBtn.dataset.id, toggleBtn.dataset.active !== 'true');
        renderAdminPromos(await adminListPromos(), state.products);
        showToast('Đã cập nhật trạng thái mã giảm giá.', 'success');
      } catch (err) {
        showToast(err.message || 'Lỗi cập nhật mã.', 'error');
        toggleBtn.disabled = false;
      }
      return;
    }
    const delBtn = e.target.closest('[data-action="delete-promo"]');
    if (delBtn) {
      const ok = await openConfirmDialog({
        title: 'Xóa mã giảm giá',
        message: `Xóa mã giảm giá "${delBtn.dataset.code}"?`,
        confirmLabel: 'Xóa mã',
        isDanger: true,
      });
      if (!ok) return;
      delBtn.disabled = true;
      try {
        await adminDeletePromo(delBtn.dataset.id);
        renderAdminPromos(await adminListPromos(), state.products);
        showToast(`Đã xóa mã "${delBtn.dataset.code}".`, 'success');
      } catch (err) {
        showToast(err.message || 'Không thể xóa mã.', 'error');
        delBtn.disabled = false;
      }
    }
  });

  document.getElementById('admin-reset-btn')?.addEventListener('click', async () => {
    try {
      await resetDemoData();
      state.products = await fetchProducts();
      refreshCatalogUi();
      await refreshAccountData();
      showToast('Đã khôi phục toàn bộ dữ liệu Demo về mặc định!', 'success');
    } catch (err) {
      showToast(err.message || 'Không thể reset dữ liệu.', 'error');
    }
  });
}
