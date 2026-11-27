/**
 * js/services/adminManualApi.js — Tầng 2: Cấu hình cấp thủ công & hoàn tất đơn thủ công qua admin-api
 */
import { SUPABASE_CONFIG, isSupabaseConfigured } from '../config/config.js';
import { readSession } from './authRefresh.js';

async function callManualAdmin(action, payload) {
  if (!isSupabaseConfigured()) throw new Error('Tính năng này chỉ hỗ trợ khi kết nối Supabase.');
  const session = readSession();
  if (!session?.accessToken) throw new Error('Phiên Admin đã hết hạn.');
  const fnUrl = `${SUPABASE_CONFIG.restUrl.replace(/\/rest\/v1\/?$/, '')}/functions/v1/admin-api`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(fnUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_CONFIG.publishableKey.trim(),
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || 'Thao tác Admin thất bại.');
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

export function adminUpdateManualStock(productId, variantKey, manualStock, price = 0) {
  return callManualAdmin('update_manual_stock', { productId, variantKey, manualStock, price });
}

export function adminCompleteManualOrder(orderCode, credential) {
  return callManualAdmin('complete_manual_order', { orderCode, credential });
}

export function adminUpdateWarranty(productId, warranty) {
  return callManualAdmin('update_warranty', { productId, warranty });
}

export function adminUpdateProduct(productId, payload) {
  return callManualAdmin('update_product', { productId, ...payload });
}

export function adminListKeys(productId = '') {
  return callManualAdmin('list_keys', { productId });
}

export function adminDeleteKey(id) {
  return callManualAdmin('delete_key', { id });
}
