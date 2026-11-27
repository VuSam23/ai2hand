/**
 * js/services/supabaseMappers.js — Chuẩn hóa dữ liệu Products & Orders từ Supabase
 */
import { buildVietQrUrl } from '../config/config.js';

export function normalizeDurationLabel(raw = '1 Tháng') {
  const cleaned = String(raw || '1 Tháng').replace(/\|/g, '-').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '1 Tháng';
  return cleaned
    .split(' ')
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('vi-VN') + w.slice(1).toLocaleLowerCase('vi-VN') : ''))
    .join(' ');
}

export function normalizeVariantKey(key = '') {
  const [dur = '1 Tháng', type = 'TK cấp sẵn'] = String(key || '').split('|');
  return `${normalizeDurationLabel(dur)}|${String(type || 'TK cấp sẵn').trim() || 'TK cấp sẵn'}`;
}

function mergeNormalizedMap(rawMap, mode = 'sum') {
  const out = {};
  if (!rawMap || typeof rawMap !== 'object') return out;
  for (const [rawKey, rawVal] of Object.entries(rawMap)) {
    const num = Math.max(0, Math.round(Number(rawVal) || 0));
    if (num <= 0) continue;
    const normKey = normalizeVariantKey(rawKey);
    if (mode === 'sum') {
      out[normKey] = (out[normKey] || 0) + num;
    } else if (!out[normKey] || num >= 1000) {
      out[normKey] = num;
    }
  }
  return out;
}

export function addVariantCount(stockInfoMap, pid, duration, accountType, count) {
  if (!pid || count <= 0) return;
  const current = stockInfoMap.get(pid) || { total: 0, variants: {} };
  current.total += count;
  const key = `${normalizeDurationLabel(duration)}|${String(accountType || 'TK cấp sẵn').trim()}`;
  current.variants[key] = (current.variants[key] || 0) + count;
  stockInfoMap.set(pid, current);
}

export function normalizeProduct(row, stockInfoMap = new Map()) {
  const id = String(row.id);
  const price = Number(row.price) || 0;
  const isActive = row.is_active !== false;
  const info = stockInfoMap.get(id) || { total: 0, variants: {} };
  const variantStocks = mergeNormalizedMap(info.variants, 'sum');
  const variantPrices = mergeNormalizedMap(row.variant_prices, 'price');
  const manualStocks = mergeNormalizedMap(row.manual_stocks, 'sum');
  const autoTotal = Object.values(variantStocks).reduce((sum, v) => sum + v, 0) || info.total;
  const manualTotal = Object.values(manualStocks).reduce((sum, v) => sum + v, 0);
  const imageUrl = String(row.image_url || '').trim();
  const rawDetailImageUrl = String(row.detail_image_url || row.banner_url || '').trim();
  return {
    id,
    name: row.name,
    category: row.category || 'Tài khoản AI',
    duration: normalizeDurationLabel(row.duration || '1 Tháng'),
    price,
    strikePrice: Math.round(price * 1.3),
    stock: isActive ? autoTotal + manualTotal : 0,
    variantStocks: isActive ? variantStocks : {},
    variantPrices,
    manualStocks: isActive ? manualStocks : {},
    warranty: String(row.warranty || '').trim() || 'Bảo hành 1 đổi 1 trọn kỳ',
    imageUrl,
    detailImageUrl: rawDetailImageUrl || imageUrl,
    rawDetailImageUrl,
    isActive,
    emblem: String(row.name || 'AC').slice(0, 2).toUpperCase(),
    tagline: `${row.category || 'Bản quyền'} • Cấp tự động 24/7`,
    description: row.description || 'Tài khoản bản quyền chính hãng, bảo hành 1 đổi 1.',
  };
}

export function getVariantPrice(product, duration = '1 Tháng', accountType = 'TK cấp sẵn') {
  if (!product) return 0;
  const normKey = `${normalizeDurationLabel(duration)}|${String(accountType || 'TK cấp sẵn').trim()}`;
  const priceMap = mergeNormalizedMap(product.variantPrices, 'price');
  return Number(priceMap[normKey] || 0);
}

export function isVariantManual(product, duration = '1 Tháng', accountType = 'TK cấp sẵn') {
  if (!product || product.isActive === false) return false;
  const normKey = `${normalizeDurationLabel(duration)}|${String(accountType || 'TK cấp sẵn').trim()}`;
  const manualMap = mergeNormalizedMap(product.manualStocks, 'sum');
  return Math.max(0, Number(manualMap[normKey] || 0)) > 0;
}

export function getVariantStock(product, duration = '1 Tháng', accountType = 'TK cấp sẵn') {
  if (!product || product.isActive === false) return 0;
  const normDur = normalizeDurationLabel(duration);
  const cleanType = String(accountType || 'TK cấp sẵn').trim();
  const key = `${normDur}|${cleanType}`;
  const manualMap = mergeNormalizedMap(product.manualStocks, 'sum');
  const manualQty = Math.max(0, Number(manualMap[key] || 0));
  if (manualQty > 0) return manualQty;
  if (product.stock === 0) return 0;
  const variants = mergeNormalizedMap(product.variantStocks, 'sum');
  const hasStockMap = Object.keys(variants).length > 0 || Object.keys(manualMap).length > 0;
  if (hasStockMap) return Number(variants[key] || 0);
  const defDur = normalizeDurationLabel(product.duration || '1 Tháng');
  const defType = product.accountType || 'TK cấp sẵn';
  return normDur === defDur && cleanType === defType ? Number(product.stock) || 0 : 0;
}

export function buildPayosQrImgUrl(qrCode = '') {
  const raw = String(qrCode || '').trim();
  if (!raw) return '';
  if (/^(https?:\/\/|data:)/i.test(raw)) return raw;
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(raw)}`;
}

export function normalizeOrder(row) {
  let creds = row.delivered_credential ?? row.credentials ?? row.delivered_credentials ?? [];
  if (typeof creds === 'string') creds = creds.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const amount = Number(row.amount ?? row.total_amount ?? row.totalAmount) || 0;
  const baseName = row.product_name || row.productName || 'Gói tài khoản';
  const matchQty = String(baseName).match(/\(x(\d+)\)/i);
  const qty = Number(row.quantity) || (matchQty ? Math.max(1, Number(matchQty[1])) : 1);
  const orderCode = row.order_code || row.orderCode || '';
  const durationPart = row.duration ? ` • ${row.duration}` : '';
  const typePart = row.account_type ? ` (${row.account_type})` : '';
  const qrCode = String(row.qrCode || '').trim();
  const dynamicQrUrl = buildPayosQrImgUrl(qrCode);

  return {
    orderCode,
    payosOrderCode: row.payos_order_code || null,
    productId: row.product_id || row.productId,
    productName: baseName.includes('•') ? baseName : `${baseName}${durationPart}${typePart}`,
    duration: String(row.duration || '').trim(),
    accountType: String(row.account_type || row.accountType || '').trim(),
    quantity: qty,
    unitPrice: Number(row.unit_price ?? row.unitPrice) || Math.round(amount / qty),
    totalAmount: amount,
    contact: row.contact || '',
    qrCode,
    checkoutUrl: String(row.checkoutUrl || '').trim(),
    bankAccountNo: String(row.accountNumber || '').trim(),
    bankAccountName: String(row.accountName || '').trim(),
    transferContent: String(row.payosDescription || orderCode).trim(),
    qrUrl: dynamicQrUrl || buildVietQrUrl(amount, orderCode),
    status: String(row.status || 'pending').toUpperCase(),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    paidAt: row.paid_at || row.paidAt || null,
    credentials: Array.isArray(creds) ? creds : [],
  };
}
