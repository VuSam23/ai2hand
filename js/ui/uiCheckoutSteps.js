/**
 * js/ui/uiCheckoutSteps.js — Tầng 3: Render trạng thái Modal VietQR 3 bước & Đếm ngược
 */
import { VIETQR_CONFIG, ACCOUNT_TYPES, isSupabaseConfigured } from '../config/config.js';
import { stopOrderPolling, getVariantStock, isVariantManual } from '../services/supabaseApi.js';
import { readSession } from '../services/authRefresh.js';
import { calculatePromoDiscount } from '../services/promoApi.js';
import { formatVnd, escapeHtml, showToast } from './uiCommon.js';
import { isPrebuiltAccountOrder, renderPrebuiltAccountGuideHtml } from './uiPrebuiltGuide.js';

let qrTimerInterval = null;

export function resolveCheckoutVariant(product, label = '1 Tháng', accountType = ACCOUNT_TYPES[0].label) {
  const key = `${label}|${accountType}`;
  const customPrice = Number(product?.variantPrices?.[key] || 0);
  const price = customPrice >= 1000 ? customPrice : Number(product?.price) || 0;
  const stock = getVariantStock(product, label, accountType);
  const isManual = isVariantManual(product, label, accountType);
  return { key, label, accountType, price, stock, isManual };
}

function buildCheckoutVariants(product) {
  const allKeys = [...new Set([...Object.keys(product?.variantPrices || {}), ...Object.keys(product?.variantStocks || {}), ...Object.keys(product?.manualStocks || {})])];
  const keys = allKeys.length > 0 ? allKeys : [`${product?.duration || '1 Tháng'}|${ACCOUNT_TYPES[0].label}`];
  return keys.map((key) => {
    const [label = '1 Tháng', accountType = ACCOUNT_TYPES[0].label] = key.split('|');
    return resolveCheckoutVariant(product, label, accountType);
  }).filter((v) => v.stock > 0);
}

export function syncCheckoutAccountTypeOptions(state, duration, preferredType = '') {
  const typeSelect = document.getElementById('checkout-account-type-select');
  if (!typeSelect) return;
  const list = (state.checkoutVariants || []).filter((v) => v.label === duration && v.stock > 0);
  const types = [...new Set(list.map((v) => v.accountType))];
  const pool = types.length > 0 ? types : [preferredType || ACCOUNT_TYPES[0].label];
  typeSelect.innerHTML = pool.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  typeSelect.value = pool.includes(preferredType) ? preferredType : pool[0];
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
  const stockEl = document.getElementById('checkout-product-stock');
  stockEl.textContent =
    availStock === 0
      ? 'Hết hàng'
      : variantObj.isManual
        ? `Còn lại: ${availStock} suất (Cấp thủ công)`
        : `Còn lại: ${availStock} tài khoản`;
  document.getElementById('checkout-unit-price').textContent =
    variantObj.price >= 1000 ? formatVnd(variantObj.price) : 'Chưa đặt giá';

  const deliveryNote = document.getElementById('checkout-delivery-note');
  const contactLabel = document.getElementById('checkout-contact-label-text');
  const contactInput = document.getElementById('checkout-contact');
  const isSharedFamily = variantObj.accountType === 'Dùng chung';
  const isUpgradeOwner = !isSharedFamily && (variantObj.isManual || variantObj.accountType === 'Nâng cấp chính chủ');
  const showPrebuiltNote = !isSharedFamily && !isUpgradeOwner && variantObj.accountType === 'TK cấp sẵn';
  if (contactLabel) {
    contactLabel.textContent = isSharedFamily
      ? 'Nhập địa chỉ Gmail cần thêm vào nhóm Family'
      : isUpgradeOwner
        ? 'Email tài khoản cần nâng cấp hoặc SĐT Zalo'
        : 'Email hoặc SĐT Zalo nhận hàng';
  }
  if (contactInput) {
    contactInput.placeholder = isSharedFamily
      ? 'Ví dụ: ten_cua_ban@gmail.com (Bắt buộc nhập đúng Gmail)'
      : 'Ví dụ: khachhang@gmail.com hoặc 0912345678';
  }
  if (deliveryNote) {
    deliveryNote.hidden = !isSharedFamily && !isUpgradeOwner && !showPrebuiltNote;
    if (isSharedFamily) deliveryNote.textContent = 'Với gói Dùng chung (Add Family), bạn chỉ cần nhập địa chỉ Gmail của bạn ở trên. Ngay sau khi thanh toán, hệ thống sẽ thêm Gmail của bạn vào nhóm Family để kích hoạt gói cước.';
    else if (isUpgradeOwner) deliveryNote.textContent = 'Với gói nâng cấp thủ công, sau khi thanh toán thành công quý khách vui lòng liên hệ Admin (Zalo / Telegram) kèm mã đơn để được hỗ trợ kích hoạt nhanh nhất.';
    else if (showPrebuiltNote) deliveryNote.textContent = 'Email + Password cấp sẵn kèm gói cước. Lưu ý đối với Gmail chỉ hỗ trợ get OTP đăng nhập tối đa 2 lần, trường hợp 2 lần trở lên sẽ tính phí 7.000đ/1 lượt.';
  }

  const qtyInput = document.getElementById('checkout-qty');
  const nextQty = availStock > 0 ? 1 : 0;
  if (qtyInput) {
    qtyInput.value = String(nextQty);
    qtyInput.max = String(Math.max(0, availStock));
  }
  syncQtyControls(nextQty, availStock);
  const createBtn = document.getElementById('checkout-create-btn');
  if (createBtn) createBtn.disabled = availStock === 0 || variantObj.price < 1000;
  updateCheckoutPriceUi(state);
}

export function calculateCheckoutTotal(state) {
  if (!state.checkoutProduct) return 0;
  const qtyInput = document.getElementById('checkout-qty');
  const qty = Math.max(1, Number.parseInt(qtyInput?.value, 10) || 1);
  const unitPrice = state.checkoutVariant?.price || state.checkoutProduct.price;
  if (unitPrice < 1000) return 0;
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
  if (variants.length === 0) {
    showToast('Sản phẩm hiện đã hết hàng.', 'error');
    return;
  }
  state.checkoutVariants = variants;
  const matched =
    (variantOverride &&
      variants.find(
        (v) =>
          v.label === variantOverride.label &&
          (!variantOverride.accountType || v.accountType === variantOverride.accountType)
      )) ||
    variants[0];

  const varWrap = document.getElementById('checkout-variant-wrap');
  const durSelect = document.getElementById('checkout-duration-select');
  const durations = [...new Set(variants.map((v) => v.label))];
  if (varWrap) varWrap.hidden = false;
  if (durSelect) {
    durSelect.innerHTML = durations.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    durSelect.value = durations.includes(matched.label) ? matched.label : durations[0];
  }
  syncCheckoutAccountTypeOptions(state, durSelect?.value || matched.label, matched.accountType);
  syncCheckoutVariantUi(
    state,
    resolveCheckoutVariant(
      product,
      durSelect?.value || matched.label,
      document.getElementById('checkout-account-type-select')?.value || matched.accountType
    )
  );

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
  const recreateBtn = document.getElementById('qr-recreate-btn');
  if (!el) return;
  const isLive = isSupabaseConfigured();
  if (paidBtn) { paidBtn.hidden = isLive; paidBtn.disabled = isLive; paidBtn.querySelector('span').textContent = 'Giả lập đã thanh toán (Test)'; }
  if (checkBtn) { checkBtn.hidden = !isLive; checkBtn.disabled = false; }
  if (recreateBtn) recreateBtn.hidden = true;
  let remaining = seconds;
  const renderTick = () => { el.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`; };
  renderTick();
  qrTimerInterval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    renderTick();
    if (remaining === 0) {
      clearInterval(qrTimerInterval); qrTimerInterval = null; stopOrderPolling();
      if (paidBtn) paidBtn.disabled = true;
      if (recreateBtn) recreateBtn.hidden = false;
      showToast('Mã VietQR đã hết thời gian giữ đơn (15 phút). Bấm "Tạo lại đơn mới".', 'error');
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
  const isManualPending = String(order.status || '').toUpperCase() === 'PENDING_MANUAL';
  const boxTitle = document.getElementById('delivered-box-title');
  if (boxTitle) boxTitle.innerHTML = isManualPending ? 'Trạng thái đơn hàng (Chờ cấp thủ công)' : 'Thông tin tài khoản / Key (<code>user|pass</code>)';
  document.getElementById('delivered-order-code').textContent = order.orderCode;
  document.getElementById('delivered-credentials').textContent = isManualPending
    ? `Đã thanh toán thành công! Vui lòng liên hệ Admin qua Zalo (0373786203) hoặc Telegram (@Acc2Hand) kèm mã đơn #${order.orderCode} để được hỗ trợ kích hoạt nhanh nhất.`
    : (order.credentials || []).join('\n');
  const copyBtn = document.getElementById('copy-all-credentials-btn');
  const dlBtn = document.getElementById('download-credentials-btn');
  const contactBox = document.getElementById('delivered-manual-contact');
  const guideBox = document.getElementById('delivered-prebuilt-guide');
  if (copyBtn) copyBtn.hidden = isManualPending;
  if (dlBtn) dlBtn.hidden = isManualPending;
  if (contactBox) contactBox.hidden = !isManualPending;
  if (guideBox) {
    const showGuide = isPrebuiltAccountOrder(order);
    guideBox.hidden = !showGuide;
    guideBox.innerHTML = showGuide ? renderPrebuiltAccountGuideHtml({ compact: false, durationLabel: order.duration || '' }) : '';
  }
  switchModalStep('success');
}
