/**
 * js/services/trafficSource.js — Theo dõi nguồn truy cập First-touch (UTM / Referrer)
 */
import { safeStorageGet, safeStorageSet } from './storage.js';

const TRAFFIC_KEY = 'digitrust_traffic_v1';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSource(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (!val) return '';
  if (val.includes('google') || val === 'gg') return 'Google';
  if (val.includes('facebook') || val === 'fb' || val.includes('fb.com')) return 'Facebook';
  if (val.includes('tiktok')) return 'TikTok';
  if (val.includes('zalo')) return 'Zalo';
  if (val === 'direct') return 'Direct';
  return String(raw).trim();
}

function detectFromReferrer() {
  if (typeof document === 'undefined' || !document.referrer) return 'Direct';
  try {
    const refHost = new URL(document.referrer).hostname.toLowerCase();
    const curHost = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    if (!refHost || (curHost && refHost === curHost)) return 'Direct';
    if (refHost.includes('google.')) return 'Google';
    if (refHost.includes('facebook.') || refHost.includes('fb.com')) return 'Facebook';
    if (refHost.includes('tiktok.')) return 'TikTok';
    if (refHost.includes('zalo.')) return 'Zalo';
    return 'Web khác';
  } catch {
    return 'Direct';
  }
}

export function captureTrafficSource() {
  if (typeof window === 'undefined') return 'Direct';
  const today = todayKey();
  const saved = safeStorageGet(TRAFFIC_KEY, null);
  if (saved?.source && saved?.date === today) return saved.source;

  const params = new URLSearchParams(window.location.search || '');
  const paramSrc = normalizeSource(params.get('utm_source') || params.get('src') || '');
  const source = paramSrc || detectFromReferrer();
  safeStorageSet(TRAFFIC_KEY, { source, date: today });
  return source;
}

export function getTrafficSource() {
  const saved = safeStorageGet(TRAFFIC_KEY, null);
  return saved?.source || captureTrafficSource();
}
