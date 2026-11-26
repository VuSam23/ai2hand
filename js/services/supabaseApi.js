/**
 * js/services/supabaseApi.js — Tầng 2: Kết nối Supabase PostgREST bằng fetch() thuần
 * Đếm tồn kho thực tế theo (product_id, duration, account_type) từ `inventory_keys` (is_sold = false).
 */
import { SUPABASE_CONFIG, isSupabaseConfigured, STORAGE_KEYS } from '../config/config.js';
import { readSession, isTokenExpiringSoon, refreshAccessToken } from './authRefresh.js';
import { getTrafficSource } from './trafficSource.js';
import { safeStorageGet, safeStorageSet } from './storage.js';
import { addVariantCount, normalizeProduct, getVariantStock, isVariantManual, normalizeOrder } from './supabaseMappers.js';
import * as mockApi from './mockApi.js';

export { getVariantStock, isVariantManual };

let activePollTimer = null;
const remotePendingOrders = new Map();

function getSupabaseOrigin() {
  return SUPABASE_CONFIG.restUrl.replace(/\/rest\/v1\/?$/, '');
}

async function getFreshUserSession() {
  let session = readSession();
  if (!session?.email || !session?.accessToken) return null;
  if (isTokenExpiringSoon(session) && session.refreshToken) {
    try {
      session = await refreshAccessToken();
    } catch {
      return null;
    }
  }
  return session;
}

function getSupabaseHeaders(extra = {}) {
  const key = SUPABASE_CONFIG.publishableKey.trim();
  const headers = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function supabaseFetch(endpoint, options = {}) {
  const url = `${SUPABASE_CONFIG.restUrl.replace(/\/$/, '')}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: getSupabaseHeaders(options.headers),
    });
    if (!res.ok) {
      const errBody = await res
        .json()
        .catch(async () => ({ message: await res.text().catch(() => res.statusText) }));
      console.warn('[Supabase REST Error]', endpoint, res.status, errBody);
      throw new Error(errBody?.message || `Supabase Error ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStockCounts() {
  const stockInfoMap = new Map();
  try {
    const rpcRows = await supabaseFetch('/rpc/get_product_stocks', { method: 'POST', body: '{}' });
    if (Array.isArray(rpcRows)) {
      if (rpcRows.some((r) => r.duration === undefined && r.account_type === undefined)) {
        console.warn('[RPC get_product_stocks] Thiếu cột duration/account_type — cần cập nhật RPC trên Supabase.');
      }
      rpcRows.forEach((r) =>
        addVariantCount(
          stockInfoMap,
          String(r.product_id ?? ''),
          r.duration,
          r.account_type,
          Number(r.stock ?? r.available_count ?? r.count ?? 0)
        )
      );
      return stockInfoMap;
    }
  } catch {
    // Fallback cho unit test / DB cũ chưa có RPC get_product_stocks
  }
  try {
    const keyRows = await supabaseFetch('/inventory_keys?is_sold=eq.false&select=product_id,duration,account_type');
    if (Array.isArray(keyRows)) {
      keyRows.forEach((r) => addVariantCount(stockInfoMap, String(r.product_id ?? ''), r.duration, r.account_type, 1));
    }
  } catch {
    // Bỏ qua nếu RLS khóa đọc trực tiếp
  }
  return stockInfoMap;
}

export async function fetchProducts() {
  if (!isSupabaseConfigured()) return [];
  try {
    const [rows, stockInfoMap] = await Promise.all([supabaseFetch('/products?select=*'), fetchStockCounts()]);
    return Array.isArray(rows) ? rows.map((r) => normalizeProduct(r, stockInfoMap)) : [];
  } catch (err) {
    console.warn('[fetchProducts Error]', err.message);
    return [];
  }
}

export async function createOrder(payload) {
  if (!isSupabaseConfigured()) return mockApi.createOrder(payload);
  const product = payload.productSnapshot || (await fetchProducts()).find((p) => p.id === payload.productId);
  if (!product) throw new Error('Không tìm thấy gói sản phẩm.');
  const quantity = Math.max(1, Number(payload.quantity) || 1);
  const duration = payload.customDuration || product.duration || '1 Tháng';
  const accountType = payload.accountType || 'Tài khoản riêng';
  const availStock = getVariantStock(product, duration, accountType);
  if (availStock < quantity) throw new Error(`Số lượng vượt quá tồn kho (${availStock}).`);

  const session = await getFreshUserSession();
  if (!session?.accessToken) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${getSupabaseOrigin()}/functions/v1/create-order`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_CONFIG.publishableKey.trim(),
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product.id,
        quantity,
        duration,
        accountType,
        contact: payload.contact.trim(),
        voucherCode: payload.voucherCode || '',
        trafficSource: getTrafficSource(),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok || !body?.data) {
      throw new Error(body?.error || body?.message || `Không thể tạo đơn hàng (${res.status}).`);
    }
    const draft = normalizeOrder(body.data);
    remotePendingOrders.set(draft.orderCode, draft);
    return draft;
  } finally {
    clearTimeout(timer);
  }
}

export function stopOrderPolling() {
  if (activePollTimer) {
    clearInterval(activePollTimer);
    activePollTimer = null;
  }
}

function saveCompletedOrderToLocal(order) {
  const history = safeStorageGet(STORAGE_KEYS.ORDERS, []);
  if (!history.some((o) => o.orderCode === order.orderCode)) {
    history.unshift(order);
    safeStorageSet(STORAGE_KEYS.ORDERS, history);
  }
}

export async function fetchOwnOrderByCode(orderCode) {
  const session = await getFreshUserSession();
  if (!session?.userId || !session?.accessToken) return null;
  const rows = await supabaseFetch(
    `/orders?order_code=eq.${encodeURIComponent(orderCode)}&user_id=eq.${encodeURIComponent(session.userId)}&select=*&limit=1`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  );
  return Array.isArray(rows) && rows[0] ? normalizeOrder(rows[0]) : null;
}

export function pollOrderStatus(orderCode, onPaid, intervalMs = 3000) {
  stopOrderPolling();
  if (!isSupabaseConfigured() || !orderCode) return;
  activePollTimer = setInterval(async () => {
    try {
      const order = await fetchOwnOrderByCode(orderCode);
      if ((order?.status === 'PAID' && order.credentials.length > 0) || order?.status === 'PENDING_MANUAL') {
        stopOrderPolling();
        remotePendingOrders.delete(orderCode);
        saveCompletedOrderToLocal(order);
        onPaid(order);
      }
    } catch {
      // Bỏ qua lỗi mạng tạm thời
    }
  }, intervalMs);
}

export async function confirmPaymentAndDeliver(orderCode) {
  stopOrderPolling();
  if (isSupabaseConfigured()) {
    const remoteOrder = await fetchOwnOrderByCode(orderCode);
    if (
      (remoteOrder?.status === 'PAID' && remoteOrder.credentials.length > 0) ||
      remoteOrder?.status === 'PENDING_MANUAL'
    ) {
      remotePendingOrders.delete(orderCode);
      saveCompletedOrderToLocal(remoteOrder);
      return remoteOrder;
    }
    throw new Error('Hệ thống chưa ghi nhận giao dịch thanh toán cho đơn này.');
  }
  return mockApi.confirmPaymentAndDeliver(orderCode);
}

export async function lookupOrders(query = '') {
  if (!isSupabaseConfigured()) return mockApi.lookupOrders(query);
  const session = await getFreshUserSession();
  if (!session?.userId || !session?.accessToken) return [];
  try {
    const rows = await supabaseFetch(
      `/orders?user_id=eq.${encodeURIComponent(session.userId)}&status=in.(paid,pending_manual)&order=created_at.desc&limit=30`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    );
    return Array.isArray(rows) ? rows.map(normalizeOrder) : [];
  } catch {
    return [];
  }
}

export async function getUserProfile() {
  const local = await mockApi.getUserProfile();
  if (!isSupabaseConfigured()) return local;
  const session = await getFreshUserSession();
  if (!session?.accessToken) return local;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${getSupabaseOrigin()}/auth/v1/user`, {
      signal: controller.signal,
      headers: { apikey: SUPABASE_CONFIG.publishableKey.trim(), Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) return local;
    const user = await res.json().catch(() => null);
    const meta = user?.user_metadata || {};
    const merged = {
      ...local,
      name: String(meta.full_name || meta.name || local.name || session.name || '').trim(),
      email: String(user?.email || session.email || local.email || '').trim(),
      phone: String(meta.phone || local.phone || '').trim(),
      joinedAt: user?.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : local.joinedAt,
    };
    await mockApi.updateUserProfile(merged);
    return merged;
  } catch {
    return local;
  } finally {
    clearTimeout(timer);
  }
}

export async function updateUserProfile(payload) {
  const updated = await mockApi.updateUserProfile(payload);
  if (!isSupabaseConfigured()) return updated;
  const session = await getFreshUserSession();
  if (!session?.accessToken) return updated;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${getSupabaseOrigin()}/auth/v1/user`, {
      method: 'PUT',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_CONFIG.publishableKey.trim(),
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { full_name: updated.name, phone: updated.phone } }),
    });
    if (!res.ok) throw new Error('Không thể đồng bộ hồ sơ lên máy chủ.');
  } finally {
    clearTimeout(timer);
  }
  return updated;
}
