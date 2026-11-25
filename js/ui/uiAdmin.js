/**
 * js/ui/uiAdmin.js — Sự kiện & Điều phối trang Quản trị Admin Kho (#view-admin)
 */
import { fetchProducts } from '../services/supabaseApi.js';
import { uploadProductIcon } from '../services/imageUpload.js';
import {
  adminAddProduct,
  adminUpdateStock,
  adminUpdatePrice,
  adminUpdateVariantPrice,
  adminDeleteProduct,
  adminImportCredentials,
  adminListPromos,
  adminUpsertPromo,
  adminTogglePromo,
  adminDeletePromo,
  resetDemoData,
} from '../services/adminApi.js';
import { showToast, copyText } from './uiCommon.js';
import { renderAdminOrders, renderAdminPromos, renderAdminView, syncImportPriceInput, switchAdminTab } from './uiAdminRender.js';

export { renderAdminOrders, renderAdminPromos, renderAdminView, switchAdminTab };

export function bindAdminEvents({ state, refreshCatalogUi, refreshAccountData }) {
  document.getElementById('admin-sidebar-nav')?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-admin-tab]');
    if (tabBtn) switchAdminTab(tabBtn.dataset.adminTab);
  });
  const renderImagePreview = (url = '') => {
    const box = document.getElementById('admin-image-preview');
    if (!box) return;
    if (/^https?:\/\//i.test(url.trim())) {
      box.innerHTML = `<img class="product-logo-img" src="${url.trim().replace(/"/g, '&quot;')}" alt="Preview" onerror="this.parentElement.textContent='IMG'" />`;
    } else {
      box.textContent = 'IMG';
    }
  };

  document.getElementById('admin-image-url')?.addEventListener('input', (e) => {
    renderImagePreview(e.target.value);
  });

  document.getElementById('admin-image-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const urlInput = document.getElementById('admin-image-url');
    e.target.disabled = true;
    try {
      showToast('Đang nén & tải ảnh lên kho...', 'info');
      const publicUrl = await uploadProductIcon(file);
      if (urlInput) urlInput.value = publicUrl;
      renderImagePreview(publicUrl);
      showToast('Đã tải ảnh đại diện thành công!', 'success');
    } catch (err) {
      showToast(err.message || 'Không thể tải ảnh lên Storage.', 'error');
    } finally {
      e.target.disabled = false;
      e.target.value = '';
    }
  });

  document.getElementById('admin-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const created = await adminAddProduct({
        name: document.getElementById('admin-name').value,
        category: document.getElementById('admin-category').value,
        price: 0,
        description: document.getElementById('admin-desc').value,
        image_url: document.getElementById('admin-image-url')?.value.trim() || '',
      });
      state.products = await fetchProducts();
      refreshCatalogUi();
      e.target.reset();
      renderImagePreview('');
      showToast(`Đã tạo gói "${created.name}"! Hãy nạp kho & đặt giá biến thể bên cạnh.`, 'success');
    } catch (err) {
      showToast(err.message || 'Không thể thêm gói mới.', 'error');
    }
  });

  ['admin-import-product', 'admin-import-duration', 'admin-import-type'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => syncImportPriceInput(state.products));
  });

  document.getElementById('admin-import-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const selectEl = document.getElementById('admin-import-product');
      const productId = selectEl?.value?.trim() || '';
      if (!productId) return showToast('Vui lòng chọn gói sản phẩm cần nạp kho.', 'error');

      const duration = document.getElementById('admin-import-duration')?.value || '1 Tháng';
      const accountType = document.getElementById('admin-import-type')?.value || 'Tài khoản riêng';
      const variantPrice = Math.round(Number(document.getElementById('admin-import-price')?.value) || 0);
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
    if (editVarBtn) {
      const vKey = editVarBtn.dataset.variantKey;
      const raw = window.prompt(`Nhập giá mới cho "${vKey.replace('|', ' • ')}" (VNĐ):`, editVarBtn.dataset.price || '');
      if (raw === null) return;
      const nextPrice = Number(raw.replace(/[^\d]/g, ''));
      if (!Number.isFinite(nextPrice) || nextPrice < 1000) {
        return showToast('Giá bán không hợp lệ (tối thiểu 1.000đ).', 'error');
      }
      try {
        await adminUpdateVariantPrice(editVarBtn.dataset.id, vKey, nextPrice);
        state.products = await fetchProducts();
        refreshCatalogUi();
        showToast('Đã cập nhật giá biến thể thành công!', 'success');
      } catch (err) {
        showToast(err.message || 'Không thể cập nhật giá biến thể.', 'error');
      }
      return;
    }

    const toggleBtn = e.target.closest('[data-action="toggle-active"]');
    if (toggleBtn) {
      toggleBtn.disabled = true;
      try {
        const nextActive = toggleBtn.dataset.active !== 'true';
        await adminUpdateStock(toggleBtn.dataset.id, nextActive);
        state.products = await fetchProducts();
        refreshCatalogUi();
        showToast(`Đã chuyển gói sang trạng thái: ${nextActive ? 'Đang bán' : 'Tạm ẩn'}.`, 'success');
      } catch (err) {
        showToast(err.message || 'Lỗi cập nhật trạng thái gói.', 'error');
        toggleBtn.disabled = false;
      }
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-price"]');
    if (editBtn) {
      const raw = window.prompt('Nhập giá mặc định mới (VNĐ, tối thiểu 1000):', editBtn.dataset.price || '');
      if (raw === null) return;
      const nextPrice = Number(raw.replace(/[^\d]/g, ''));
      if (!Number.isFinite(nextPrice) || nextPrice < 1000) {
        return showToast('Giá bán không hợp lệ (tối thiểu 1.000đ).', 'error');
      }
      try {
        await adminUpdatePrice(editBtn.dataset.id, nextPrice);
        state.products = await fetchProducts();
        refreshCatalogUi();
        showToast('Đã cập nhật giá gói thành công!', 'success');
      } catch (err) {
        showToast(err.message || 'Không thể cập nhật giá.', 'error');
      }
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-product"]');
    if (delBtn) {
      if (!window.confirm(`Xác nhận xóa vĩnh viễn gói "${delBtn.dataset.name}"?`)) return;
      delBtn.disabled = true;
      try {
        await adminDeleteProduct(delBtn.dataset.id);
        state.products = await fetchProducts();
        refreshCatalogUi();
        showToast(`Đã xóa gói "${delBtn.dataset.name}".`, 'success');
      } catch (err) {
        showToast(err.message || 'Không thể xóa gói.', 'error');
        delBtn.disabled = false;
      }
    }
  });

  document.getElementById('admin-orders-list')?.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy-raw]');
    if (copyBtn) copyText(copyBtn.dataset.copyRaw, 'tài khoản', copyBtn);
  });

  document.getElementById('admin-promo-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const code = document.getElementById('admin-promo-code').value.trim().toUpperCase();
      const discountType = document.getElementById('admin-promo-type').value;
      const discountValue = Math.round(Number(document.getElementById('admin-promo-value').value) || 0);
      const productId = document.getElementById('admin-promo-product').value || null;
      const duration = document.getElementById('admin-promo-duration')?.value || null;
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
      if (!window.confirm(`Xóa mã giảm giá "${delBtn.dataset.code}"?`)) return;
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
