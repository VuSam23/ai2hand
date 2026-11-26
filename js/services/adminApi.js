/**
 * js/services/adminApi.js — Tầng 2: Quản lý phiên đăng nhập Supabase Auth & Phân quyền Admin
 * Trong chế độ Demo Local, isAdminLoggedIn() mặc định là false để không lộ quyền Admin.
 */
import { SUPABASE_CONFIG, isSupabaseConfigured } from '../config/config.js';
import * as mockApi from './mockApi.js';
import { getTrafficSource } from './trafficSource.js';
import {
  AUTH_SESSION_KEY,
  readSession,
  saveSession,
  calcExpiresAt,
  isTokenExpiringSoon,
  refreshAccessToken,
} from './authRefresh.js';

function getSupabaseOrigin() {
  return SUPABASE_CONFIG.restUrl.replace(/\/rest\/v1\/?$/, '');
}

function checkIsAdminUser(user, fallbackEmail = '') {
  const email = String(user?.email || fallbackEmail).trim().toLowerCase();
  const role = String(
    user?.app_metadata?.role || user?.user_metadata?.role || ''
  ).toLowerCase();
  if (role === 'admin') return true;
  const allowedList = (SUPABASE_CONFIG.adminEmails || []).map((e) => e.toLowerCase());
  return Boolean(email && allowedList.includes(email));
}

export function getAdminSession() {
  return readSession();
}

export function isUserLoggedIn() {
  return Boolean(getAdminSession()?.email);
}

export function isAdminLoggedIn() {
  const session = getAdminSession();
  if (!session || session.isDemo) return false;
  return Boolean(session.accessToken && session.isAdmin === true);
}

export function startDemoUserSession() {
  const demoSession = {
    accessToken: null,
    email: 'khachhang@gmail.com',
    name: 'Nguyễn Văn A',
    isAdmin: false,
    isDemo: true,
  };
  try {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(demoSession));
  } catch {
    // Bỏ qua lỗi sessionStorage
  }
  return demoSession;
}

export function adminLogout() {
  try {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Bỏ qua lỗi sessionStorage
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function adminLogin(email, password) {
  if (!isSupabaseConfigured()) {
    throw new Error('Chưa cấu hình Supabase Publishable Key.');
  }
  const key = SUPABASE_CONFIG.publishableKey.trim();
  const res = await fetchWithTimeout(`${getSupabaseOrigin()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email).trim().toLowerCase(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error('Email hoặc mật khẩu không chính xác.');
  }
  return buildAuthSession(data, email);
}

function buildAuthSession(data, email) {
  const userEmail = String(data.user?.email || email).trim().toLowerCase();
  const displayName =
    data.user?.user_metadata?.full_name ||
    data.user?.user_metadata?.name ||
    userEmail.split('@')[0];
  return saveSession({
    userId: data.user?.id || null,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: calcExpiresAt(data),
    email: userEmail,
    name: displayName,
    isAdmin: checkIsAdminUser(data.user, userEmail),
    isDemo: false,
  });
}

function authPost(path, body) {
  return fetchWithTimeout(`${getSupabaseOrigin()}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_CONFIG.publishableKey.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function userSignUp(email, password) {
  if (!isSupabaseConfigured()) throw new Error('Chưa cấu hình Supabase Publishable Key.');
  const cleanEmail = String(email).trim().toLowerCase();
  if (String(password).length < 8) throw new Error('Mật khẩu cần tối thiểu 8 ký tự.');
  const res = await authPost('signup', {
    email: cleanEmail,
    password,
    data: { traffic_source: getTrafficSource() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Không thể đăng ký với email này. Vui lòng thử lại.');
  return { needsConfirm: !data.access_token };
}

export async function userResetPassword(email) {
  const cleanEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    throw new Error('Vui lòng nhập email hợp lệ để đặt lại mật khẩu.');
  }
  if (isSupabaseConfigured()) {
    await authPost('recover', { email: cleanEmail }).catch(() => null);
  }
  return 'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.';
}

const SESSION_EXPIRED_MSG = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';

async function sendAdminRequest(token, action, payload) {
  const res = await fetchWithTimeout(`${getSupabaseOrigin()}/functions/v1/admin-api`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CONFIG.publishableKey.trim(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, payload }),
  });
  return { res, body: await res.json().catch(() => ({})) };
}

async function refreshOrExpire() {
  try {
    return await refreshAccessToken();
  } catch {
    adminLogout();
    throw new Error(SESSION_EXPIRED_MSG);
  }
}

async function callAdminFunction(action, payload = {}) {
  let session = getAdminSession();
  if (!isAdminLoggedIn() || !session?.accessToken) {
    throw new Error('Chỉ tài khoản Admin mới có quyền thực hiện thao tác này.');
  }
  if (isTokenExpiringSoon(session)) session = await refreshOrExpire();

  let { res, body } = await sendAdminRequest(session.accessToken, action, payload);
  if (res.status === 401) {
    session = await refreshOrExpire();
    ({ res, body } = await sendAdminRequest(session.accessToken, action, payload));
    if (res.status === 401) {
      adminLogout();
      throw new Error(SESSION_EXPIRED_MSG);
    }
  }
  if (res.status === 403) {
    throw new Error(`Tài khoản ${body.email || session.email} không có quyền Admin trên máy chủ.`);
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `Admin API Error (${res.status})`);
  }
  return body;
}

export async function adminAddProduct(payload) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để thêm sản phẩm.');
  const res = await callAdminFunction('add_product', payload);
  return res.data;
}

export async function adminUpdateStock(productId, isActive) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để cập nhật trạng thái gói.');
  const res = await callAdminFunction('update_stock', {
    productId,
    is_active: Boolean(isActive),
  });
  return res.data;
}

export async function adminImportCredentials(
  productId,
  rawText,
  duration = '1 Tháng',
  accountType = 'TK cấp sẵn'
) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để nạp kho.');
  const cleanId = String(productId || '').trim();
  if (!cleanId) throw new Error('Vui lòng chọn gói sản phẩm hợp lệ.');
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('Vui lòng dán ít nhất 1 dòng tài khoản user|pass.');
  const res = await callAdminFunction('import_keys', {
    productId: cleanId,
    duration: String(duration || '1 Tháng').trim(),
    accountType: String(accountType || 'TK cấp sẵn').trim(),
    lines,
  });
  return {
    importedCount: res.importedCount,
    duplicateCount: res.duplicateCount || 0,
    updatedStock: res.updatedStock,
  };
}

export async function adminUpdatePrice(productId, price) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để cập nhật giá.');
  const res = await callAdminFunction('update_price', { productId, price: Number(price) });
  return res.data;
}

export async function adminUpdateVariantPrice(productId, variantKey, price) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để cập nhật giá biến thể.');
  const res = await callAdminFunction('update_variant_price', {
    productId,
    variantKey,
    price: Number(price),
  });
  return res.data;
}

export async function adminDeleteProduct(productId) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để xóa gói.');
  return callAdminFunction('delete_product', { productId });
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
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để lưu mã giảm giá.');
  const res = await callAdminFunction('upsert_promo', payload);
  return res.data;
}

export async function adminTogglePromo(id, isActive) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để cập nhật mã giảm giá.');
  const res = await callAdminFunction('toggle_promo', { id, is_active: Boolean(isActive) });
  return res.data;
}

export async function adminDeletePromo(id) {
  if (!isAdminLoggedIn()) throw new Error('Cần quyền Admin để xóa mã giảm giá.');
  return callAdminFunction('delete_promo', { id });
}

export const resetDemoData = mockApi.resetDemoData;
