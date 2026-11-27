/**
 * js/services/adminManualApi.js — Tầng 2: Cấu hình cấp thủ công, đơn hàng, voucher & key lẻ qua admin-api
 */
import { callAdminFunction, isAdminLoggedIn } from './adminApi.js';

export async function adminUpdateManualStock(productId, variantKey, manualStock, price = 0) {
  const res = await callAdminFunction('update_manual_stock', { productId, variantKey, manualStock, price });
  return res.data;
}

export async function adminCompleteManualOrder(orderCode, credential) {
  const res = await callAdminFunction('complete_manual_order', { orderCode, credential });
  return res.data;
}

export async function adminUpdateWarranty(productId, warranty) {
  const res = await callAdminFunction('update_warranty', { productId, warranty });
  return res.data;
}

export async function adminUpdateProduct(productId, payload) {
  const res = await callAdminFunction('update_product', { productId, ...payload });
  return res.data;
}

export async function adminListKeys(productId = '') {
  const res = await callAdminFunction('list_keys', { productId });
  return Array.isArray(res.data) ? res.data : [];
}

export async function adminDeleteKey(id) {
  return callAdminFunction('delete_key', { id });
}

export async function adminListOrders() {
  if (!isAdminLoggedIn()) return [];
  const res = await callAdminFunction('list_orders');
  return Array.isArray(res.data) ? res.data : [];
}

export async function adminListPromos() {
  if (!isAdminLoggedIn()) return [];
  const res = await callAdminFunction('list_promos');
  return Array.isArray(res.data) ? res.data : [];
}

export async function adminUpsertPromo(payload) {
  const res = await callAdminFunction('upsert_promo', payload);
  return res.data;
}

export async function adminTogglePromo(id, isActive) {
  const res = await callAdminFunction('toggle_promo', { id, is_active: Boolean(isActive) });
  return res.data;
}

export async function adminDeletePromo(id) {
  return callAdminFunction('delete_promo', { id });
}
