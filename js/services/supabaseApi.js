/**
 * js/services/supabaseApi.js — Tầng 2: Kết nối Supabase PostgREST bằng fetch() thuần
 * Đếm tồn kho thực tế theo (product_id, duration, account_type) từ `inventory_keys` (is_sold = false).
 */
import { SUPABASE_CONFIG, isSupabaseConfigured, STORAGE_KEYS } from '../config/config.js';
import { readSession, isTokenExpiringSoon, refreshAccessToken } from './authRefresh.js';
import { getTrafficSource } from './trafficSource.js';
import { safeStorageGet, safeStorageSet } from './storage.js';
import { addVariantCount, normalizeProduct, getVariantStock, normalizeOrder } from './supabaseMappers.js';
import * as mockApi from './mockApi.js';

export { getVariantStock };

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
  if (!isSupabaseConfigured()) return mockApi.fetchProducts();
  try {
    const [rows, stockInfoMap] = await Promise.all([supabaseFetch('/products?select=*'), fetchStockCounts()]);
    if (Array.isArray(rows) && rows.length > 0) return rows.map((r) => normalizeProduct(r, stockInfoMap));
    return mockApi.fetchProducts();
  } catch (err) {
    console.warn('[Fallback -> mockApi.fetchProducts]', err.message);
    return mockApi.fetchProducts();
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
    try {
      const remoteOrder = await fetchOwnOrderByCode(orderCode);
      if (remoteOrder?.status === 'PAID' && remoteOrder.credentials.length > 0) {
        remotePendingOrders.delete(orderCode);
        saveCompletedOrderToLocal(remoteOrder);
        return remoteOrder;
      }
    } catch {
      // Nhánh test local
    }
    const draft = remotePendingOrders.get(orderCode);
    if (draft) {
      const demoCreds = Array.from({ length: draft.quantity }, (_, idx) => {
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `${draft.productId}.${orderCode.toLowerCase()}.${idx + 1}@ai2hand.vn|Pass#${rand}Vip`;
      });
      const simulated = { ...draft, status: 'PAID', paidAt: new Date().toISOString(), credentials: demoCreds };
      remotePendingOrders.delete(orderCode);
      saveCompletedOrderToLocal(simulated);
      return simulated;
    }
  }
  return mockApi.confirmPaymentAndDeliver(orderCode);
}

export async function lookupOrders(query = '') {
  const localHistory = await mockApi.lookupOrders(query);
  if (!isSupabaseConfigured()) return localHistory;
  const session = await getFreshUserSession();
  if (!session?.userId || !session?.accessToken) return localHistory;
  try {
    const rows = await supabaseFetch(
      `/orders?user_id=eq.${encodeURIComponent(session.userId)}&status=in.(paid,pending_manual)&order=created_at.desc&limit=30`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const merged = rows.map(normalizeOrder);
      localHistory.forEach((loc) => {
        if (!merged.some((r) => r.orderCode === loc.orderCode)) merged.push(loc);
      });
      return merged;
    }
    return localHistory;
  } catch {
    return localHistory;
  }
}

export const getUserProfile = mockApi.getUserProfile;
export const updateUserProfile = mockApi.updateUserProfile;
