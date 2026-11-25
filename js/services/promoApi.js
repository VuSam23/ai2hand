/**
 * js/services/promoApi.js — Kiểm tra & tính toán Mã giảm giá (promo_codes)
 */
import { SUPABASE_CONFIG, isSupabaseConfigured, VOUCHERS } from '../config/config.js';

export function calculatePromoDiscount(promo, subTotal) {
  if (!promo || subTotal <= 0) return 0;
  if (promo.discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(promo.discountValue) || 0));
    return Math.round((subTotal * pct) / 100);
  }
  return Math.min(subTotal, Math.max(0, Math.round(Number(promo.discountValue) || 0)));
}

export async function validatePromoCode(rawCode, productId = null, duration = null) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;

  if (!isSupabaseConfigured()) {
    const local = VOUCHERS[code];
    if (!local) throw new Error('Mã giảm giá không tồn tại.');
    return {
      code: local.code,
      discountType: 'percent',
      discountValue: Math.round(local.rate * 100),
      productId: null,
      duration: null,
      label: local.label,
    };
  }

  const key = SUPABASE_CONFIG.publishableKey.trim();
  const base = SUPABASE_CONFIG.restUrl.replace(/\/$/, '');
  const url = `${base}/promo_codes?code=eq.${encodeURIComponent(code)}&is_active=eq.true&select=*&limit=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error('Không thể kiểm tra mã giảm giá lúc này.');
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new Error('Mã giảm giá không tồn tại hoặc đã hết hạn.');
    if (row.product_id && productId && row.product_id !== productId) {
      throw new Error('Mã giảm giá này chỉ áp dụng cho gói sản phẩm khác.');
    }
    if (row.duration && row.duration !== duration) {
      throw new Error(`Mã giảm giá này chỉ áp dụng cho thời hạn ${row.duration}.`);
    }
    const val = Number(row.discount_value) || 0;
    const label =
      row.discount_type === 'percent'
        ? `Giảm ${val}%`
        : `Giảm ${val.toLocaleString('vi-VN')}₫`;
    return {
      code: row.code,
      discountType: row.discount_type,
      discountValue: val,
      productId: row.product_id || null,
      duration: row.duration || null,
      label,
    };
  } finally {
    clearTimeout(timer);
  }
}
