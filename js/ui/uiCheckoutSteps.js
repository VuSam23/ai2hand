/**
 * js/ui/uiCheckoutSteps.js — Tầng 3: Render trạng thái Modal VietQR 3 bước & Đếm ngược
 */
import { VIETQR_CONFIG, ACCOUNT_TYPES, isSupabaseConfigured } from '../config/config.js';
import { stopOrderPolling, getVariantStock } from '../services/supabaseApi.js';
import { readSession } from '../services/authRefresh.js';
import { calculatePromoDiscount } from '../services/promoApi.js';
import { formatVnd, showToast } from './uiCommon.js';

let qrTimerInterval = null;

function buildCheckoutVariants(product) {
  const entries = Object.entries(product?.variantPrices || {})
    .map(([key, rawPrice]) => {
      const price = Number(rawPrice) || 0;
      if (price < 1000) return null;
      const [label = '1 Tháng', accountType = ACCOUNT_TYPES[0].label] = key.split('|');
      return { key, label, accountType, price, stock: getVariantStock(product, label, accountType) };
    })
    .filter(Boolean);
  if (entries.length > 0) return entries;
  const label = product?.duration || '1 Tháng';
  const accountType = ACCOUNT_TYPES[0].label;
  return [{ key: `${label}|${accountType}`, label, accountType, price: Number(product?.price) || 0, stock: Number(product?.stock) || 0 }];
}

export function syncQtyControls(qty, availStock) {
  const minusBtn = document.getElementById('checkout-qty-minus');
  const plusBtn = document.getElementById('checkout-qty-plus');
  const empty = availStock <= 0;
  if (minusBtn) minusBtn.disabled = empty || qty <= 1;
  if (plusBtn) plusBtn.disabled = empty || qty >= availStock;
}

export function syncCheckoutVariantUi(state, variantObj) {
  if (!state.checkoutProduct || !variantObj) return;
  state.checkoutVariant = variantObj;
  const availStock = Number(variantObj.stock) || 0;
  document.getElementById('checkout-product-name').textContent =
    `${state.checkoutProduct.name} • ${variantObj.label} (${variantObj.accountType})`;
  document.getElementById('checkout-product-stock').textContent = `Còn lại: ${availStock} tài khoản`;
  document.getElementById('checkout-unit-price').textContent = formatVnd(variantObj.price);

  const qtyInput = document.getElementById('checkout-qty');
  const nextQty = availStock > 0 ? 1 : 0;
  if (qtyInput) {
    qtyInput.value = String(nextQty);
    qtyInput.max = String(Math.max(0, availStock));
  }
  syncQtyControls(nextQty, availStock);
  const createBtn = document.getElementById('checkout-create-btn');
  if (createBtn) createBtn.disabled = availStock === 0;
  updateCheckoutPriceUi(state);
}

export function calculateCheckoutTotal(state) {
  if (!state.checkoutProduct) return 0;
  const qtyInput = document.getElementById('checkout-qty');
  const qty = Math.max(1, Number.parseInt(qtyInput?.value, 10) || 1);
  const unitPrice = state.checkoutVariant?.price || state.checkoutProduct.price;
  const subTotal = unitPrice * qty;
  const discount = calculatePromoDiscount(state.activeVoucher, subTotal);
  return Math.max(1000, subTotal - discount);
}

export function updateCheckoutPriceUi(state) {
  const totalEl = document.getElementById('checkout-total-price');
  if (totalEl) totalEl.textContent = formatVnd(calculateCheckoutTotal(state));
}

export function switchModalStep(step) {
  const stepLabel = document.getElementById('modal-step-label');
  const title = document.getElementById('modal-title');
  document.getElementById('checkout-form').hidden = step !== 'form';
  document.getElementById('checkout-qr-step').hidden = step !== 'qr';
  document.getElementById('checkout-success-step').hidden = step !== 'success';

  if (step === 'form') {
    stepLabel.textContent = 'Bước 1/2 • Thông tin nhận hàng';
    title.textContent = 'Xác nhận đơn hàng';
  } else if (step === 'qr') {
    stepLabel.textContent = 'Bước 2/2 • Tự động kiểm tra giao dịch mỗi 3s';
    title.textContent = 'Quét mã VietQR tự động 24/7';
  } else {
    stepLabel.textContent = 'Hoàn tất • Giao hàng tức thì';
    title.textContent = 'Nhận tài khoản của bạn';
  }
}

export function openCheckoutModal(state, product, variantOverride = null) {
  const modal = document.getElementById('checkout-modal');
  if (!modal || !product) return;

  stopOrderPolling();
  state.checkoutProduct = product;
  state.pendingOrder = null;
  state.activeVoucher = null;

  const variants = buildCheckoutVariants(product);
  state.checkoutVariants = variants;
  const matched =
    (variantOverride &&
      variants.find(
        (v) =>
          v.label === variantOverride.label &&
          (!variantOverride.accountType || v.accountType === variantOverride.accountType)
      )) ||
    variants.find((v) => v.stock > 0) ||
    variants[0];

  const varWrap = document.getElementById('checkout-variant-wrap');
  const varSelect = document.getElementById('checkout-variant-select');
  if (varWrap) varWrap.hidden = variants.length <= 1;
  if (varSelect) {
    varSelect.innerHTML = variants
      .map(
        (v) =>
          `<option value="${v.key}">${v.label} • ${v.accountType} — ${formatVnd(v.price)} (Còn ${v.stock})</option>`
      )
      .join('');
    varSelect.value = matched.key;
  }
  syncCheckoutVariantUi(state, matched);

  const voucherInput = document.getElementById('checkout-voucher-input');
  const discountNote = document.getElementById('checkout-discount-note');
  if (voucherInput) voucherInput.value = '';
  if (discountNote) {
    discountNote.hidden = true;
    discountNote.textContent = '';
    discountNote.classList.remove('is-error');
  }

  updateCheckoutPriceUi(state);

  const contactInput = document.getElementById('checkout-contact');
  const prefillEmail = readSession()?.email || state.userProfile?.email || '';
  if (contactInput && !contactInput.value.trim() && prefillEmail) contactInput.value = prefillEmail;

  const errorEl = document.getElementById('checkout-contact-error');
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  switchModalStep('form');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

export function closeCheckoutModal() {
  stopOrderPolling();
  if (qrTimerInterval) {
    clearInterval(qrTimerInterval);
    qrTimerInterval = null;
  }
  const modal = document.getElementById('checkout-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function startQrCountdown(seconds = 900) {
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  const el = document.getElementById('qr-countdown');
  const paidBtn = document.getElementById('simulate-paid-btn');
  const checkBtn = document.getElementById('check-order-status-btn');
  if (!el) return;

  const isLive = isSupabaseConfigured();
  if (paidBtn) {
    paidBtn.hidden = isLive;
    paidBtn.disabled = isLive;
    paidBtn.querySelector('span').textContent = 'Giả lập đã thanh toán (Test)';
  }
  if (checkBtn) {
    checkBtn.hidden = !isLive;
    checkBtn.disabled = false;
  }

  let remaining = seconds;
  const renderTick = () => {
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  };
  renderTick();

  qrTimerInterval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    renderTick();
    if (remaining === 0) {
      clearInterval(qrTimerInterval);
      qrTimerInterval = null;
      stopOrderPolling();
      if (paidBtn) {
        paidBtn.disabled = true;
        paidBtn.querySelector('span').textContent = 'Phiên QR đã hết hạn (Tạo lại đơn)';
      }
      showToast('Mã VietQR đã hết thời gian giữ đơn (15 phút).', 'error');
    }
  }, 1000);
}

export function renderVietQrStep(order) {
  document.getElementById('qr-order-code').textContent = order.orderCode;
  const qrImg = document.getElementById('vietqr-img');
  const fallbackMsg = document.getElementById('vietqr-fallback-msg');
  if (fallbackMsg) fallbackMsg.hidden = true;
  if (qrImg) {
    qrImg.hidden = false;
    qrImg.src = order.qrUrl;
  }

  document.getElementById('qr-bank-name').textContent = order.bankAccountName || VIETQR_CONFIG.BANK_NAME;
  document.getElementById('qr-account-no').textContent = order.bankAccountNo || VIETQR_CONFIG.ACCOUNT_NO;
  document.getElementById('qr-amount').textContent = formatVnd(order.totalAmount);
  document.getElementById('copy-amount-btn').dataset.copyValue = String(order.totalAmount);
  document.getElementById('qr-add-info').textContent = order.transferContent || order.orderCode;
  const payosLink = document.getElementById('payos-checkout-link');
  if (payosLink) {
    payosLink.href = order.checkoutUrl || '#';
    payosLink.hidden = !order.checkoutUrl;
  }
  switchModalStep('qr');
  startQrCountdown(900);
}

export function renderDeliveredStep(order) {
  stopOrderPolling();
  if (qrTimerInterval) {
    clearInterval(qrTimerInterval);
    qrTimerInterval = null;
  }
  document.getElementById('delivered-order-code').textContent = order.orderCode;
  document.getElementById('delivered-credentials').textContent = order.credentials.join('\n');
  switchModalStep('success');
}
