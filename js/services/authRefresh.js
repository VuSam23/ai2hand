/**
 * js/services/authRefresh.js — Lưu phiên & Silent Refresh access_token (Supabase Auth)
 */
import { SUPABASE_CONFIG } from '../config/config.js';

export const AUTH_SESSION_KEY = 'digitrust_auth_session_v1';
let refreshPromise = null;

export function readSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage
  }
  return session;
}

export function calcExpiresAt(data) {
  if (data?.expires_at) return Number(data.expires_at);
  return Math.floor(Date.now() / 1000) + (Number(data?.expires_in) || 3600);
}

function decodeJwtExp(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return 0;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return Number(JSON.parse(atob(padded))?.exp) || 0;
  } catch {
    return 0;
  }
}

export function isTokenExpiringSoon(session, skewSeconds = 60) {
  if (!session?.accessToken) return true;
  const exp = Number(session.expiresAt) || decodeJwtExp(session.accessToken);
  if (!exp) return false;
  return exp - Math.floor(Date.now() / 1000) < skewSeconds;
}

async function doRefresh() {
  const session = readSession();
  if (!session?.refreshToken) throw new Error('NO_REFRESH_TOKEN');
  const origin = SUPABASE_CONFIG.restUrl.replace(/\/rest\/v1\/?$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${origin}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      signal: controller.signal,
      headers: { apikey: SUPABASE_CONFIG.publishableKey.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error('REFRESH_FAILED');
    return saveSession({
      ...session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAt: calcExpiresAt(data),
    });
  } finally {
    clearTimeout(timer);
  }
}

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
