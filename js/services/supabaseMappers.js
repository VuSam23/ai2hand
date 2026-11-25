/**
 * js/services/supabaseMappers.js — Chuẩn hóa dữ liệu Products & Orders từ Supabase
 */
import { buildVietQrUrl } from '../config/config.js';

export function addVariantCount(stockInfoMap, pid, duration, accountType, count) {
  if (!pid || count <= 0) return;
  const current = stockInfoMap.get(pid) || { total: 0, variants: {} };
  current.total += count;
  if (duration || accountType) {
    const key = `${String(duration || '1 Tháng').trim()}|${String(accountType || 'Tài khoản riêng').trim()}`;
    current.variants[key] = (current.variants[key] || 0) + count;
  }
  stockInfoMap.set(pid, current);
}

export function normalizeProduct(row, stockInfoMap = new Map()) {
  const id = String(row.id);
  const price = Number(row.price) || 0;
  const isActive = row.is_active !== false;
  const info = stockInfoMap.get(id) || { total: 0, variants: {} };
  const variantPrices = row.variant_prices && typeof row.variant_prices === 'object' ? row.variant_prices : {};
  return {
    id,
    name: row.name,
    category: row.category || 'Tài khoản AI',
    duration: '1 Tháng',
    price,
    strikePrice: Math.round(price * 1.3),
    stock: isActive ? info.total : 0,
    variantStocks: isActive ? info.variants : {},
    variantPrices,
    imageUrl: String(row.image_url || '').trim(),
    isActive,
    emblem: String(row.name || 'AC').slice(0, 2).toUpperCase(),
    tagline: `${row.category || 'Bản quyền'} • Cấp tự động 24/7`,
    description: row.description || 'Tài khoản bản quyền chính hãng, bảo hành 1 đổi 1.',
  };
}

export function getVariantStock(product, duration = '1 Tháng', accountType = 'Tài khoản riêng') {
  if (!product || product.isActive === false || product.stock === 0) return 0;
  const variants = product.variantStocks || {};
  if (Object.keys(variants).length === 0) return product.stock;
  return Number(variants[`${duration}|${accountType}`] || 0);
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
