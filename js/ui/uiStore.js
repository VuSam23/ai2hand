/**
 * js/ui/uiStore.js — Render Trang chủ (#view-home) & Chi tiết sản phẩm (#view-product-detail)
 */
import { CATEGORIES, DURATION_VARIANTS, ACCOUNT_TYPES } from '../config/config.js';
import { getVariantStock, getVariantPrice, isVariantManual } from '../services/supabaseApi.js';
import { formatVnd, escapeHtml } from './uiCommon.js';
import { renderSaleDescriptionHtml } from './uiPrebuiltGuide.js';
import { renderEmblemHtml, renderCardCoverHtml, renderDetailMediaHtml, getProductDurations, getCheapestVariant } from './uiStoreVariants.js';

export { getProductDurations, getCheapestVariant };

export function renderCategories(activeCategory, allProducts = []) {
  const container = document.getElementById('category-filters');
  if (!container) return;
  container.innerHTML = CATEGORIES.map((cat) => {
    const count = cat === 'Tất cả' ? allProducts.length : allProducts.filter((p) => p.category === cat).length;
    return `
      <button type="button" class="filter-chip ${cat === activeCategory ? 'is-active' : ''}" data-category="${escapeHtml(cat)}" role="tab" aria-selected="${cat === activeCategory}">
        <span>${escapeHtml(cat)}</span>
        <span class="result-count-pill">${count}</span>
      </button>`;
  }).join('');
}

export function renderProductDetail(product, selectedVariantIndex = 0, selectedTypeId = 'private') {
  if (!product) return;

  const durationList = getProductDurations(product);
  const isLifetime = String(product.duration).toLowerCase().includes('vĩnh viễn') && durationList.length <= DURATION_VARIANTS.length;
  const durStockOf = (lbl) => ACCOUNT_TYPES.reduce((s, t) => s + getVariantStock(product, lbl, t.label), 0);
  let resolvedIdx = Math.min(Math.max(0, selectedVariantIndex), Math.max(0, durationList.length - 1));
  if (!isLifetime && durStockOf(durationList[resolvedIdx]?.label || '1 Tháng') <= 0) {
    const firstInStockIdx = durationList.findIndex((d) => durStockOf(d.label) > 0);
    if (firstInStockIdx !== -1) resolvedIdx = firstInStockIdx;
  }
  const rawDurLabel = isLifetime
    ? product.duration
    : durationList[resolvedIdx]?.label || '1 Tháng';
  let activeType = ACCOUNT_TYPES.find((t) => t.id === selectedTypeId) || ACCOUNT_TYPES[0];
  if (getVariantStock(product, rawDurLabel, activeType.label) <= 0) {
    activeType = ACCOUNT_TYPES.find((t) => getVariantStock(product, rawDurLabel, t.label) > 0) || activeType;
  }
  const fallbackBasePrice = Math.round(Number(product.price) || 0);
  const base1M = getVariantPrice(product, '1 Tháng', activeType.label) || fallbackBasePrice;
  const variants = isLifetime
    ? [{
        label: product.duration,
        multiplier: 1,
        price: getVariantPrice(product, product.duration, activeType.label) >= 1000
          ? getVariantPrice(product, product.duration, activeType.label)
          : fallbackBasePrice,
        strike: 0,
        stock: getVariantStock(product, product.duration, activeType.label),
        durStock: durStockOf(product.duration),
      }]
    : durationList.map((v) => {
        const customPrice = getVariantPrice(product, v.label, activeType.label);
        const price = customPrice >= 1000 ? customPrice : fallbackBasePrice;
        const months = /tháng|thang/i.test(v.label) ? Math.max(1, Number.parseInt(v.label, 10) || 1) : 1;
        const strike = months > 1 && base1M >= 1000 ? Math.round((base1M * months) / 1000) * 1000 : 0;
        return { label: v.label, multiplier: v.multiplier, price, strike, stock: getVariantStock(product, v.label, activeType.label), durStock: durStockOf(v.label) };
      });

  let activeIdx = Math.min(resolvedIdx, variants.length - 1);
  if (variants[activeIdx]?.durStock <= 0) {
    const availIdx = variants.findIndex((v) => v.durStock > 0);
    if (availIdx !== -1) activeIdx = availIdx;
  }
  const currentVariant = variants[activeIdx];
  const variantStock = getVariantStock(product, currentVariant.label, activeType.label);

  document.getElementById('detail-breadcrumb-cat').textContent = product.category;
  document.getElementById('detail-breadcrumb-name').textContent = product.name;
  const isManual = isVariantManual(product, currentVariant.label, activeType.label);
  const heroEmblemEl = document.getElementById('hero-emblem');
  if (heroEmblemEl) heroEmblemEl.innerHTML = renderDetailMediaHtml(product, heroEmblemEl);
  document.getElementById('hero-tagline').textContent = isManual
    ? `${product.category} • Cấp thủ công (Email / Zalo)`
    : product.tagline || product.duration;
  const deliveryEl = document.getElementById('detail-delivery-method');
  if (deliveryEl) deliveryEl.textContent = isManual ? 'Cấp thủ công • Admin giao key qua Email / Zalo sau khi thanh toán' : 'Tự động qua Web & Lưu lịch sử';
  const warEl = document.getElementById('detail-warranty');
  if (warEl) warEl.textContent = product.warranty || 'Bảo hành 1 đổi 1 trọn kỳ';
  document.getElementById('hero-category').textContent = product.category;
  document.getElementById('hero-title').textContent = product.name;
  document.getElementById('hero-desc').innerHTML = renderSaleDescriptionHtml(product.description);
  document.getElementById('hero-duration').textContent = `${currentVariant.label} • ${activeType.label}`;
  const isUnpriced = currentVariant.price < 1000;
  document.getElementById('hero-price').textContent = isUnpriced ? 'Chưa mở bán' : formatVnd(currentVariant.price);
  const hasDiscount = !isUnpriced && currentVariant.strike > currentVariant.price;
  const strikeEl = document.getElementById('hero-strike');
  if (strikeEl) {
    strikeEl.hidden = !hasDiscount;
    strikeEl.textContent = hasDiscount ? formatVnd(currentVariant.strike) : '';
  }

  const stickyDuration = document.getElementById('sticky-detail-duration');
  const stickyPrice = document.getElementById('sticky-detail-price');
  if (stickyDuration) stickyDuration.textContent = `${currentVariant.label} • ${activeType.label}`;
  if (stickyPrice) stickyPrice.textContent = isUnpriced ? 'Chưa mở bán' : formatVnd(currentVariant.price);

  const pct = hasDiscount ? Math.round((1 - currentVariant.price / currentVariant.strike) * 100) : 0;
  const discountEl = document.getElementById('hero-discount');
  if (discountEl) {
    discountEl.hidden = isUnpriced || pct <= 0;
    discountEl.textContent = pct > 0 ? `-${pct}%` : '';
  }

  const durationWrap = document.getElementById('detail-duration-options');
  if (durationWrap) {
    const availDurations = variants.map((v, idx) => ({ ...v, idx })).filter((v) => v.durStock > 0);
    durationWrap.innerHTML = availDurations.length > 0
      ? availDurations.map((v) => `
        <button type="button" class="duration-btn ${v.idx === activeIdx ? 'is-active' : ''}" data-variant-index="${v.idx}">
          <strong>${escapeHtml(v.label)}</strong>
          <span>${v.price >= 1000 ? formatVnd(v.price) : 'Chưa mở bán'} • Còn ${v.durStock}</span>
        </button>`).join('')
      : '<span class="section-subtitle">Sản phẩm tạm hết hàng</span>';
  }

  const typeWrap = document.getElementById('detail-account-types');
  if (typeWrap) {
    const availTypes = ACCOUNT_TYPES.filter((t) => getVariantStock(product, currentVariant.label, t.label) > 0);
    typeWrap.innerHTML = availTypes.length > 0
      ? availTypes.map((t) => {
          const tStock = getVariantStock(product, currentVariant.label, t.label);
          const customT = getVariantPrice(product, currentVariant.label, t.label);
          const tPrice = customT >= 1000 ? customT : fallbackBasePrice;
          return `
        <button type="button" class="account-type-btn ${t.id === activeType.id ? 'is-active' : ''}" data-type-id="${escapeHtml(t.id)}">
          <strong>${escapeHtml(t.label)}</strong>
          <span>${tPrice >= 1000 ? formatVnd(tPrice) : 'Chưa mở bán'} • SL: ${tStock}</span>
          <span>${escapeHtml(t.desc)}</span>
        </button>`;
        }).join('')
      : '<span class="section-subtitle">Sản phẩm tạm hết hàng</span>';
  }

  const stockEl = document.getElementById('hero-stock');
  const isEmpty = variantStock === 0;
  stockEl.textContent = isEmpty
    ? 'Còn 0 tài khoản (Hết hàng)'
    : isManual
      ? `Còn ${variantStock} suất (Cấp thủ công)`
      : `Còn ${variantStock} tài khoản`;
  stockEl.classList.toggle('is-empty', isEmpty);

  const buyBtn = document.getElementById('hero-buy-btn');
  buyBtn.dataset.productId = product.id;
  buyBtn.dataset.variantPrice = String(currentVariant.price);
  buyBtn.dataset.variantLabel = currentVariant.label;
  buyBtn.dataset.accountType = activeType.label;
  buyBtn.dataset.variantStock = String(variantStock);
  buyBtn.disabled = isEmpty || currentVariant.price < 1000;
  buyBtn.querySelector('span').textContent =
    currentVariant.price < 1000
      ? 'Chưa mở bán'
      : isEmpty
        ? 'Hết hàng'
        : `Mua Ngay (${formatVnd(currentVariant.price)})`;
}

export function renderProductGrid(products) {
  const grid = document.getElementById('product-grid');
  const countEl = document.getElementById('catalog-count');
  if (!grid) return;

  if (countEl) countEl.textContent = `${products.length} sản phẩm`;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>Không tìm thấy gói tài khoản phù hợp với bộ lọc hiện tại.</p>
        <button type="button" class="btn btn-ghost" data-action="reset-filters">
          Xóa bộ lọc &amp; Xem tất cả
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = products
    .map((item) => {
      const cheapest = getCheapestVariant(item);
      const displayStock = cheapest.stock > 0 ? cheapest.stock : item.stock;
      const isEmpty = displayStock === 0;
      const isLow = displayStock > 0 && displayStock <= 5;
      const stockClass = isEmpty ? 'is-empty' : isLow ? 'is-low' : '';
      const stockLabel = isEmpty ? 'Hết hàng' : `Còn ${displayStock}<span class="card-stock-unit"> tài khoản</span>`;
      const coverHtml = renderCardCoverHtml(item, stockLabel, stockClass);
      const hasPrice = cheapest.price >= 1000;
      const hasDiscount = hasPrice && Number(cheapest.strike) > cheapest.price;
      const priceLabel = hasPrice ? formatVnd(cheapest.price) : 'Chưa mở bán';
      const discountPct = hasDiscount ? Math.round((1 - cheapest.price / cheapest.strike) * 100) : 0;

      return `
        <article class="product-card ${isEmpty ? 'is-out-of-stock' : ''} ${coverHtml ? 'has-cover' : ''}" data-product-id="${escapeHtml(item.id)}">
          ${coverHtml}
          <div class="card-head">
            <span class="card-cat">${escapeHtml(item.category)}</span>
            <span class="card-stock ${stockClass}">${stockLabel}</span>
          </div>
          <div class="card-main-row">
            <div class="card-emblem">${renderEmblemHtml(item)}</div>
            <div class="card-meta">
              <h3 class="card-title">${escapeHtml(item.name)}</h3>
              <p class="card-desc">${escapeHtml(item.description)}</p>
            </div>
          </div>
          <div class="card-specs">
            <div class="card-spec-row"><span>Phiên bản:</span><strong>${escapeHtml(cheapest.label)} • ${escapeHtml(cheapest.accountType)}</strong></div>
            <div class="card-spec-row"><span>Bảo hành:</span><strong class="text-primary">${escapeHtml(item.warranty)}</strong></div>
          </div>
          <div class="card-footer">
            <div class="card-price-row">
              <strong class="card-price">${priceLabel}</strong>
              ${hasDiscount ? `<del class="card-strike">${formatVnd(cheapest.strike)}</del>` : ''}
              ${discountPct > 0 ? `<span class="discount-badge card-discount-badge">-${discountPct}%</span>` : ''}
            </div>
            <div class="card-actions">
              <button type="button" class="btn btn-primary btn-buy-now" data-action="buy" data-id="${escapeHtml(item.id)}" data-variant-label="${escapeHtml(cheapest.label)}" data-account-type="${escapeHtml(cheapest.accountType)}" data-variant-price="${cheapest.price}" data-variant-stock="${displayStock}" ${isEmpty || !hasPrice ? 'disabled' : ''}>
                ${!hasPrice ? 'Chưa mở bán' : isEmpty ? 'Hết hàng' : 'Mua ngay'}
              </button>
              <button type="button" class="btn btn-ghost btn-detail" data-action="detail" data-id="${escapeHtml(item.id)}">
                Chi tiết
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}
