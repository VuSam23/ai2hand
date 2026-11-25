/**
 * js/services/adminManualApi.js — Tầng 2: Cấu hình cấp thủ công theo biến thể qua admin-api
 */
import { SUPABASE_CONFIG, isSupabaseConfigured } from '../config/config.js';
import { readSession } from './authRefresh.js';

export async function adminUpdateManualStock(productId, variantKey, manualStock) {
  if (!isSupabaseConfigured()) throw new Error('Cấu hình cấp thủ công chỉ hỗ trợ khi kết nối Supabase.');
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
      body: JSON.stringify({ action: 'update_manual_stock', payload: { productId, variantKey, manualStock } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || 'Không thể cập nhật cấu hình cấp thủ công.');
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

