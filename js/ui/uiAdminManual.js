/**
 * js/ui/uiAdminManual.js — Thao tác cấu hình thủ công, sửa sản phẩm & quản lý key lẻ
 */
import { CATEGORIES, DURATION_VARIANTS, ACCOUNT_TYPES } from '../config/config.js';
import { fetchProducts } from '../services/supabaseApi.js';
import { adminUpdateStock, adminUpdatePrice, adminUpdateVariantPrice, adminDeleteProduct, adminListOrders } from '../services/adminApi.js';
import {
  adminUpdateManualStock,
  adminCompleteManualOrder,
  adminUpdateWarranty,
  adminUpdateProduct,
  adminListKeys,
  adminDeleteKey,
} from '../services/adminManualApi.js';
import { renderAdminOrders, renderAdminKeysList } from './uiAdminRender.js';
import { openFormDialog, openConfirmDialog } from './uiDialog.js';
import { showToast } from './uiCommon.js';

export async function handleEditManualStock(btn, state, refreshCatalogUi) {
  const vKey = btn.dataset.variantKey || '';
  const vals = await openFormDialog({
    title: 'Cấu hình Cấp thủ công',
    eyebrow: vKey.replace('|', ' • '),
    fields: [{ name: 'qty', label: 'Số suất nhận đơn thủ công (nhập 0 để tắt)', type: 'number', min: 0, value: btn.dataset.manualStock || '0', required: true }],
  });
  if (!vals) return;
  const nextQty = Math.max(0, Number.parseInt(vals.qty, 10) || 0);
  try {
    await adminUpdateManualStock(btn.dataset.id, vKey, nextQty);
    state.products = await fetchProducts();
    refreshCatalogUi();
    showToast(nextQty > 0 ? `Đã bật Cấp thủ công (${nextQty} suất).` : 'Đã tắt Cấp thủ công.', 'success');
  } catch (err) {
    showToast(err.message || 'Không thể cập nhật cấp thủ công.', 'error');
  }
}

export async function handleAddManualVariant(btn, state, refreshCatalogUi) {
  const vals = await openFormDialog({
    title: `Thêm biến thể / Cấp thủ công (${btn.dataset.name || 'Gói'})`,
    fields: [
      { name: 'duration', label: 'Thời hạn', type: 'select', options: DURATION_VARIANTS.map((d) => d.label), value: '1 Tháng' },
      { name: 'accountType', label: 'Loại tài khoản', type: 'select', options: ACCOUNT_TYPES.map((t) => t.label), value: 'Nâng cấp chính chủ' },
      { name: 'price', label: 'Giá bán (VNĐ >= 1000)', type: 'number', min: 1000, value: '60000', required: true },
      { name: 'qty', label: 'Số suất Cấp thủ công (0 nếu chỉ đặt giá)', type: 'number', min: 0, value: '10', required: true },
    ],
  });
  if (!vals) return;
  const price = Math.round(Number(vals.price) || 0);
  if (price < 1000) return showToast('Giá bán phải từ 1.000đ trở lên.', 'error');
  const vKey = `${vals.duration}|${vals.accountType}`;
  const qty = Math.max(0, Number.parseInt(vals.qty, 10) || 0);
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
  const vals = await openFormDialog({
    title: `Hoàn tất đơn thủ công #${orderCode}`,
    fields: [{ name: 'credential', label: 'Thông tin bàn giao / Ghi chú cho khách', value: 'Đã kích hoạt chính chủ qua Email / Zalo', required: true }],
    submitLabel: 'Xác nhận bàn giao',
  });
  if (!vals?.credential?.trim()) return;
  btn.disabled = true;
  try {
    await adminCompleteManualOrder(orderCode, vals.credential.trim());
    renderAdminOrders(await adminListOrders());
    showToast(`Đã hoàn tất & bàn giao đơn #${orderCode}!`, 'success');
  } catch (err) {
    showToast(err.message || 'Không thể hoàn tất đơn thủ công.', 'error');
    btn.disabled = false;
  }
}

export async function handleEditWarranty(btn, state, refreshCatalogUi) {
  const vals = await openFormDialog({
    title: 'Cập nhật Thời gian bảo hành',
    fields: [{ name: 'warranty', label: 'Nội dung bảo hành', value: btn.dataset.warranty || 'Bảo hành 1 đổi 1 trọn kỳ', required: true }],
  });
  if (!vals?.warranty?.trim()) return;
  try {
    await adminUpdateWarranty(btn.dataset.id, vals.warranty.trim());
    state.products = await fetchProducts();
    refreshCatalogUi();
    showToast('Đã cập nhật thời gian bảo hành!', 'success');
  } catch (err) {
    showToast(err.message || 'Không thể cập nhật bảo hành.', 'error');
  }
}

export async function handleEditProduct(btn, state, refreshCatalogUi) {
  const prod = state.products.find((p) => p.id === btn.dataset.id);
  if (!prod) return;
  const catOpts = CATEGORIES.filter((c) => c !== 'Tất cả');
  const vals = await openFormDialog({
    title: `Sửa thông tin: ${prod.name}`,
    fields: [
      { name: 'name', label: 'Tên sản phẩm', value: prod.name, required: true },
      { name: 'category', label: 'Danh mục', type: 'select', options: catOpts, value: prod.category },
      { name: 'description', label: 'Mô tả ngắn', value: prod.description },
      { name: 'warranty', label: 'Thời gian bảo hành', value: prod.warranty },
      { name: 'image_url', label: 'URL ảnh đại diện', type: 'url', value: prod.imageUrl || '' },
    ],
  });
  if (!vals?.name?.trim()) return;
  try {
    await adminUpdateProduct(prod.id, vals);
    state.products = await fetchProducts();
    refreshCatalogUi();
    showToast('Đã cập nhật thông tin sản phẩm!', 'success');
  } catch (err) {
    showToast(err.message || 'Không thể cập nhật sản phẩm.', 'error');
  }
}

export async function refreshAdminKeys(state) {
  const productId = document.getElementById('admin-keys-filter')?.value || '';
  try {
    const keys = await adminListKeys(productId);
    renderAdminKeysList(keys, state.products);
  } catch (err) {
    showToast(err.message || 'Không thể tải danh sách key.', 'error');
  }
}

export async function handleDeleteKey(btn, state, refreshCatalogUi) {
  const ok = await openConfirmDialog({
    title: 'Xóa key khỏi kho',
    message: 'Xóa vĩnh viễn key chưa bán này khỏi inventory_keys?',
    confirmLabel: 'Xóa key',
    isDanger: true,
  });
  if (!ok) return;
  btn.disabled = true;
  try {
    await adminDeleteKey(btn.dataset.id);
    state.products = await fetchProducts();
    refreshCatalogUi();
    await refreshAdminKeys(state);
    showToast('Đã xóa key khỏi kho.', 'success');
  } catch (err) {
    showToast(err.message || 'Không thể xóa key.', 'error');
    btn.disabled = false;
  }
}

export async function handlePriceDialog(btn, state, refreshCatalogUi, isVariant = false) {
  const vKey = btn.dataset.variantKey || '';
  const title = isVariant ? `Sửa giá: ${vKey.replace('|', ' • ')}` : 'Sửa giá mặc định gói';
  const vals = await openFormDialog({
    title,
    fields: [{ name: 'price', label: 'Giá bán mới (VNĐ >= 1000)', type: 'number', min: 1000, value: btn.dataset.price || '', required: true }],
  });
  if (!vals) return;
  const nextPrice = Number(vals.price);
  if (!Number.isFinite(nextPrice) || nextPrice < 1000) return showToast('Giá bán tối thiểu 1.000đ.', 'error');
  try {
    if (isVariant) await adminUpdateVariantPrice(btn.dataset.id, vKey, nextPrice);
    else await adminUpdatePrice(btn.dataset.id, nextPrice);
    state.products = await fetchProducts();
    refreshCatalogUi();
    showToast('Đã cập nhật giá thành công!', 'success');
  } catch (err) {
    showToast(err.message || 'Không thể cập nhật giá.', 'error');
  }
}

export async function handleProductAction(btn, state, refreshCatalogUi, isDelete = false) {
  if (isDelete) {
    const ok = await openConfirmDialog({
      title: 'Xóa sản phẩm',
      message: `Xác nhận xóa vĩnh viễn gói "${btn.dataset.name}"?`,
      confirmLabel: 'Xóa gói',
      isDanger: true,
    });
    if (!ok) return;
  }
  btn.disabled = true;
  try {
    const nextActive = btn.dataset.active !== 'true';
    if (isDelete) await adminDeleteProduct(btn.dataset.id);
    else await adminUpdateStock(btn.dataset.id, nextActive);
    state.products = await fetchProducts();
    refreshCatalogUi();
    showToast(isDelete ? `Đã xóa gói "${btn.dataset.name}".` : `Đã chuyển gói sang trạng thái: ${nextActive ? 'Đang bán' : 'Tạm ẩn'}.`, 'success');
  } catch (err) {
    showToast(err.message || 'Thao tác sản phẩm thất bại.', 'error');
    btn.disabled = false;
  }
}
