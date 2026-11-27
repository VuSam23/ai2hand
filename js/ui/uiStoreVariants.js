/**
 * js/ui/uiStoreVariants.js — Helpers hình ảnh & lựa chọn biến thể sản phẩm
 */
import { DURATION_VARIANTS, ACCOUNT_TYPES } from '../config/config.js';
import { getVariantStock, getVariantPrice, normalizeDurationLabel } from '../services/supabaseApi.js';
import { escapeHtml } from './uiCommon.js';

if (typeof document !== 'undefined') {
  document.addEventListener(
    'error',
    (e) => {
      const target = e.target;
      if (!target || target.tagName !== 'IMG') return;
      if (target.classList.contains('product-logo-img')) {
        target.hidden = true;
        if (target.nextElementSibling) target.nextElementSibling.hidden = false;
      } else if (target.classList.contains('card-cover-img')) {
        target.hidden = true;
        if (target.nextElementSibling) target.nextElementSibling.hidden = false;
      } else if (target.classList.contains('product-detail-banner-img')) {
        target.closest('#hero-emblem')?.classList.remove('is-detail-banner');
        target.hidden = true;
        if (target.nextElementSibling) target.nextElementSibling.hidden = false;
      }
    },
    true
  );
}

export function renderEmblemHtml(product) {
  const emblem = escapeHtml(product?.emblem || 'ACC');
  const url = String(product?.imageUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return emblem;
  return `<img class="product-logo-img" src="${escapeHtml(url)}" alt="${escapeHtml(product?.name || 'Logo')}" loading="lazy" /><span hidden>${emblem}</span>`;
}

export function renderCardCoverHtml(product, stockLabel, stockClass) {
  const url = String(product?.detailImageUrl || product?.imageUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return '';
  const emblem = escapeHtml(product?.emblem || 'ACC');
  return `<div class="card-cover"><img class="card-cover-img" src="${escapeHtml(url)}" alt="${escapeHtml(product?.name || 'Banner')}" loading="lazy" /><span class="card-cover-fallback" hidden>${emblem}</span><span class="card-stock card-cover-stock ${stockClass}">${stockLabel}</span></div>`;
}

export function renderDetailMediaHtml(product, emblemEl) {
  const emblem = escapeHtml(product?.emblem || 'ACC');
  const url = String(product?.detailImageUrl || product?.imageUrl || '').trim();
  const hasBanner = /^https?:\/\//i.test(url);
  emblemEl?.classList.toggle('is-detail-banner', hasBanner);
  if (!hasBanner) return emblem;
  return `<img class="product-detail-banner-img" src="${escapeHtml(url)}" alt="${escapeHtml(product?.name || 'Banner')}" loading="eager" /><span hidden>${emblem}</span>`;
}

export function getProductDurations(product) {
  const allKeys = [
    ...Object.keys(product?.variantPrices || {}),
    ...Object.keys(product?.variantStocks || {}),
    ...Object.keys(product?.manualStocks || {}),
  ];
  const custom = allKeys.map((k) => normalizeDurationLabel(k.split('|')[0])).filter(Boolean);
  const labels = [...new Set([...DURATION_VARIANTS.map((d) => normalizeDurationLabel(d.label)), ...custom])];
  return labels.map((label) => DURATION_VARIANTS.find((d) => normalizeDurationLabel(d.label) === label) || { label, multiplier: 1 });
}

export function getCheapestVariant(product) {
  const durationList = getProductDurations(product);
  const rawKeys = [
    ...Object.keys(product?.variantPrices || {}),
    ...Object.keys(product?.variantStocks || {}),
    ...Object.keys(product?.manualStocks || {}),
  ];
  const allKeys = [...new Set(rawKeys.map((k) => {
    const [d = '1 Tháng', t = ACCOUNT_TYPES[0].label] = k.split('|');
    return `${normalizeDurationLabel(d)}|${t.trim()}`;
  }))];
  const candidates = allKeys.map((key) => {
    const [label = '1 Tháng', accountType = ACCOUNT_TYPES[0].label] = key.split('|');
    const customPrice = getVariantPrice(product, label, accountType);
    const price = customPrice >= 1000 ? customPrice : Math.round(Number(product?.price) || 0);
    const stock = getVariantStock(product, label, accountType);
    const vIdx = Math.max(0, durationList.findIndex((d) => d.label === label));
    const tObj = ACCOUNT_TYPES.find((t) => t.label === accountType) || ACCOUNT_TYPES[0];
    const months = /tháng|thang/i.test(label) ? Math.max(1, Number.parseInt(label, 10) || 1) : 1;
    const base1M = getVariantPrice(product, '1 Tháng', tObj.label);
    const strike = months > 1 && base1M >= 1000 ? Math.round((base1M * months) / 1000) * 1000 : 0;
    return { label, accountType: tObj.label, accountTypeId: tObj.id, variantIndex: vIdx, price, strike, stock };
  });

  const pricedInStock = candidates.filter((c) => c.stock > 0 && c.price >= 1000);
  const anyInStock = candidates.filter((c) => c.stock > 0);
  const priced = candidates.filter((c) => c.price >= 1000);
  const pool = pricedInStock.length > 0 ? pricedInStock : anyInStock.length > 0 ? anyInStock : priced.length > 0 ? priced : candidates;
  if (pool.length > 0) {
    pool.sort((a, b) => a.price - b.price);
    return pool[0];
  }
  const basePrice = Math.round(Number(product?.price) || 0);
  return {
    label: product?.duration || '1 Tháng',
    accountType: ACCOUNT_TYPES[0].label,
    accountTypeId: ACCOUNT_TYPES[0].id,
    variantIndex: 0,
    price: basePrice,
    stock: Number(product?.stock) || 0,
  };
}
