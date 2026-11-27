import { STORAGE_KEYS, VOUCHERS, buildVietQrUrl } from '../config/config.js';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_VAULT_OBJECT,
  DEFAULT_USER_PROFILE,
  DEFAULT_DEMO_ORDERS,
  safeStorageGet,
  safeStorageSet,
  resetAllDemoStorage,
} from './storage.js';

const pendingOrders = new Map();

function delay(ms = 160) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProductsState() {
  const saved = safeStorageGet(STORAGE_KEYS.PRODUCTS, null);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  safeStorageSet(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
  return [...DEFAULT_PRODUCTS];
}

function loadVaultState() {
  const saved = safeStorageGet(STORAGE_KEYS.VAULT, null);
  if (saved && typeof saved === 'object') return saved;
  safeStorageSet(STORAGE_KEYS.VAULT, DEFAULT_VAULT_OBJECT);
  return { ...DEFAULT_VAULT_OBJECT };
}

function loadOrdersState() {
  const saved = safeStorageGet(STORAGE_KEYS.ORDERS, null);
  if (Array.isArray(saved)) return saved;
  safeStorageSet(STORAGE_KEYS.ORDERS, DEFAULT_DEMO_ORDERS);
  return [...DEFAULT_DEMO_ORDERS];
}

export async function getUserProfile() {
  await delay(60);
  const saved = safeStorageGet(STORAGE_KEYS.USER, null);
  if (saved && saved.name && saved.email) return saved;
  safeStorageSet(STORAGE_KEYS.USER, DEFAULT_USER_PROFILE);
  return { ...DEFAULT_USER_PROFILE };
}

export async function updateUserProfile(payload) {
  await delay(100);
  const current = await getUserProfile();
  const updated = {
    ...current,
    name: String(payload.name || current.name).trim(),
    email: String(payload.email || current.email).trim(),
    phone: String(payload.phone ?? current.phone).trim(),
  };
  safeStorageSet(STORAGE_KEYS.USER, updated);
  return updated;
}

export async function fetchProducts() {
  await delay(80);
  // [INTEGRATION POINT]: Thay bằng fetch(`${SUPABASE_URL}/rest/v1/products?select=*`)
  return loadProductsState();
}

export async function createOrder({
  productId,
  quantity,
  contact,
  customUnitPrice,
  customDuration,
  accountType,
  voucherCode,
}) {
  await delay(160);
  const products = loadProductsState();
  const product = products.find((item) => item.id === productId);
  if (!product) throw new Error('Không tìm thấy gói sản phẩm.');
  if (product.stock < quantity || quantity < 1) {
    throw new Error(`Số lượng vượt quá tồn kho hiện tại (${product.stock}).`);
  }

  const unitPrice = Number(customUnitPrice) || product.price;
  const subTotal = unitPrice * quantity;
  const normalizedVoucher = String(voucherCode || '').trim().toUpperCase();
  const voucher = VOUCHERS[normalizedVoucher] || null;
  const discountAmount = voucher ? Math.round(subTotal * voucher.rate) : 0;
  const totalAmount = Math.max(1000, subTotal - discountAmount);

  const orderCode = `ACC${Math.floor(10000 + Math.random() * 90000)}`;
  const durationPart = customDuration ? ` • ${customDuration}` : '';
  const typePart = accountType ? ` (${accountType})` : '';

  const orderDraft = {
    orderCode,
    productId: product.id,
    productName: `${product.name}${durationPart}${typePart}`,
    quantity,
    unitPrice,
    discountAmount,
    voucherCode: voucher ? voucher.code : null,
    totalAmount,
    contact: contact.trim(),
    qrUrl: buildVietQrUrl(totalAmount, orderCode),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  // [INTEGRATION POINT]: Lưu đơn PENDING lên Supabase / Backend
  pendingOrders.set(orderCode, orderDraft);
  return orderDraft;
}

export async function confirmPaymentAndDeliver(orderCode) {
  await delay(260);
  // [INTEGRATION POINT]: Polling hoặc Supabase Realtime chờ Webhook SePay xác nhận
  const order = pendingOrders.get(orderCode);
  if (!order) throw new Error('Không tìm thấy đơn hàng hoặc phiên giao dịch đã hết hạn.');

  const products = loadProductsState();
  const productIdx = products.findIndex((p) => p.id === order.productId);
  if (productIdx === -1 || products[productIdx].stock < order.quantity) {
    throw new Error('Kho vừa hết hàng, vui lòng liên hệ Zalo hỗ trợ.');
  }

  products[productIdx].stock -= order.quantity;
  safeStorageSet(STORAGE_KEYS.PRODUCTS, products);

  const vault = loadVaultState();
  const pool = Array.isArray(vault[order.productId]) ? [...vault[order.productId]] : [];
  const deliveredCredentials = [];

  for (let i = 0; i < order.quantity; i += 1) {
    if (pool.length > 0) {
      deliveredCredentials.push(pool.shift());
    } else {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      deliveredCredentials.push(
        `${order.productId}.${order.orderCode.toLowerCase()}.${suffix}@ai2hand.id.vn|Pass#${suffix}Vip`
      );
    }
  }
  vault[order.productId] = pool;
  safeStorageSet(STORAGE_KEYS.VAULT, vault);

  const completedOrder = {
    ...order,
    status: 'PAID',
    paidAt: new Date().toISOString(),
    credentials: deliveredCredentials,
  };
  pendingOrders.delete(orderCode);

  const history = loadOrdersState();
  history.unshift(completedOrder);
  safeStorageSet(STORAGE_KEYS.ORDERS, history);
  return completedOrder;
}

export async function lookupOrders(query = '') {
  await delay(100);
  const history = loadOrdersState();
  const keyword = query.trim().toLowerCase();
  if (!keyword) return history;
  return history.filter(
    (o) => o.orderCode.toLowerCase().includes(keyword) || o.contact.toLowerCase().includes(keyword)
  );
}

export async function adminAddProduct(payload) {
  await delay(140);
  const products = loadProductsState();
  const slug =
    payload.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Math.floor(100 + Math.random() * 900);

  const newProduct = {
    id: slug,
    name: payload.name.trim(),
    category: payload.category,
    duration: payload.duration.trim() || '1 Tháng',
    price: Number(payload.price),
    strikePrice: Number(payload.strikePrice) || Math.round(Number(payload.price) * 1.3),
    stock: 0,
    emblem: payload.name.trim().slice(0, 2).toUpperCase(),
    tagline: `${payload.category} • Cấp tự động 24/7`,
    description:
      payload.description.trim() ||
      'Tài khoản bản quyền chính hãng, giao tự động 24/7 và bảo hành 1 đổi 1.',
  };

  products.unshift(newProduct);
  safeStorageSet(STORAGE_KEYS.PRODUCTS, products);
  const vault = loadVaultState();
  vault[newProduct.id] = [];
  safeStorageSet(STORAGE_KEYS.VAULT, vault);
  return newProduct;
}

export async function adminUpdateStock(productId, newStock) {
  await delay(100);
  const products = loadProductsState();
  const target = products.find((p) => p.id === productId);
  if (!target) throw new Error('Không tìm thấy sản phẩm.');
  target.stock = Math.max(0, Number.parseInt(newStock, 10) || 0);
  safeStorageSet(STORAGE_KEYS.PRODUCTS, products);
  return target;
}

export async function adminImportCredentials(productId, rawText) {
  await delay(150);
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('Vui lòng dán ít nhất 1 dòng tài khoản user|pass.');

  const vault = loadVaultState();
  const currentPool = Array.isArray(vault[productId]) ? vault[productId] : [];
  vault[productId] = [...currentPool, ...lines];
  safeStorageSet(STORAGE_KEYS.VAULT, vault);

  const products = loadProductsState();
  const target = products.find((p) => p.id === productId);
  if (!target) throw new Error('Không tìm thấy sản phẩm.');
  target.stock += lines.length;
  safeStorageSet(STORAGE_KEYS.PRODUCTS, products);
  return { importedCount: lines.length, updatedStock: target.stock };
}

export async function resetDemoData() {
  await delay(120);
  pendingOrders.clear();
  resetAllDemoStorage();
}
