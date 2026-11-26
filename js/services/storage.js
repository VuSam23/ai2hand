import { STORAGE_KEYS, STORAGE_SCHEMA_VERSION } from '../config/config.js';

export const DEFAULT_VAULT_OBJECT = {};

export const DEFAULT_PRODUCTS = [];

export const DEFAULT_USER_PROFILE = {
  name: '',
  email: '',
  phone: '',
  tier: 'Thành viên',
  joinedAt: '',
};

export const DEFAULT_DEMO_ORDERS = [];

export function safeStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) return fallback;
    return parsed.data ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeStorageSet(key, data) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: STORAGE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        data,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function resetAllDemoStorage() {
  safeStorageSet(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
  safeStorageSet(STORAGE_KEYS.VAULT, DEFAULT_VAULT_OBJECT);
  safeStorageSet(STORAGE_KEYS.USER, DEFAULT_USER_PROFILE);
  safeStorageSet(STORAGE_KEYS.ORDERS, DEFAULT_DEMO_ORDERS);
}
