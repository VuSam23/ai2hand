/**
 * js/ui/uiCheckout.js — Tầng 3: Gắn sự kiện Modal VietQR, Voucher & Polling Supabase
 */
import { CONTACT_REGEX } from '../config/config.js';
import { validatePromoCode } from '../services/promoApi.js';
import {
  createOrder,
  confirmPaymentAndDeliver,
  fetchProducts,
  fetchOwnOrderByCode,
  pollOrderStatus,
} from '../services/supabaseApi.js';
import { showToast, copyText, downloadTextFile } from './uiCommon.js';
import {
  calculateCheckoutTotal,
  updateCheckoutPriceUi,
  openCheckoutModal,
  closeCheckoutModal,
  switchModalStep,
  renderVietQrStep,
  renderDeliveredStep,
  syncQtyControls,
  syncCheckoutVariantUi,
  resolveCheckoutVariant,
  syncCheckoutAccountTypeOptions,
} from './uiCheckoutSteps.js';

export {
  calculateCheckoutTotal,
  updateCheckoutPriceUi,
  openCheckoutModal,
  closeCheckoutModal,
  switchModalStep,
  renderVietQrStep,
  renderDeliveredStep,
};

export function bindCheckoutEvents({ state, refreshCatalogUi, refreshAccountData }) {
  document.getElementById('modal-close-btn')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('success-done-btn')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkout-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'checkout-modal') closeCheckoutModal();
  });

  const qrImg = document.getElementById('vietqr-img');
  qrImg?.addEventListener('error', () => {
    qrImg.hidden = true;
    const fallback = document.getElementById('vietqr-fallback-msg');
    if (fallback) fallback.hidden = false;
  });

  const qtyInput = document.getElementById('checkout-qty');
  const adjustQty = (nextQty) => {
    if (!state.checkoutProduct || !qtyInput) return;
    const availStock = Number(state.checkoutVariant?.stock ?? state.checkoutProduct.stock ?? 0);
    if (availStock <= 0) {
      qtyInput.value = '0';
      return syncQtyControls(0, 0);
    }
    if (nextQty > availStock) showToast(`Chỉ còn tối đa ${availStock} tài khoản trong kho.`, 'info');
    const clamped = Math.max(1, Math.min(availStock, nextQty));
    qtyInput.value = String(clamped);
    syncQtyControls(clamped, availStock);
    updateCheckoutPriceUi(state);
  };
  document.getElementById('checkout-qty-minus')?.addEventListener('click', () => {
    adjustQty((Number.parseInt(qtyInput?.value, 10) || 1) - 1);
  });
  document.getElementById('checkout-qty-plus')?.addEventListener('click', () => {
    adjustQty((Number.parseInt(qtyInput?.value, 10) || 1) + 1);
  });

  const handleVariantChange = async (e) => {
    if (!state.checkoutProduct) return;
    const dur = document.getElementById('checkout-duration-select')?.value || '1 Tháng';
    const typeSelect = document.getElementById('checkout-account-type-select');
    if (e?.target?.id === 'checkout-duration-select') {
      syncCheckoutAccountTypeOptions(state, dur, typeSelect?.value || '');
    }
    const type = typeSelect?.value || 'Tài khoản riêng';
    const chosen = resolveCheckoutVariant(state.checkoutProduct, dur, type);
    syncCheckoutVariantUi(state, chosen);
    if (state.activeVoucher) {
      const noteEl = document.getElementById('checkout-discount-note');
      try {
        await validatePromoCode(state.activeVoucher.code, state.checkoutProduct?.id, chosen.label);
        if (noteEl) {
          noteEl.hidden = false;
          noteEl.textContent = `Đã áp dụng ${state.activeVoucher.code}: ${state.activeVoucher.label}!`;
          noteEl.classList.remove('is-error');
        }
      } catch (err) {
        state.activeVoucher = null;
        if (noteEl) {
          noteEl.hidden = false;
          noteEl.textContent = err.message || 'Mã giảm giá không áp dụng cho gói vừa chọn.';
          noteEl.classList.add('is-error');
        }
      }
      updateCheckoutPriceUi(state);
    }
  };
  document.getElementById('checkout-duration-select')?.addEventListener('change', handleVariantChange);
  document.getElementById('checkout-account-type-select')?.addEventListener('change', handleVariantChange);

  document.getElementById('checkout-voucher-btn')?.addEventListener('click', async () => {
    const code = document.getElementById('checkout-voucher-input')?.value.trim().toUpperCase() || '';
    const noteEl = document.getElementById('checkout-discount-note');
    if (!noteEl) return;

    if (!code) {
      state.activeVoucher = null;
      noteEl.hidden = true;
      updateCheckoutPriceUi(state);
      return;
    }

    try {
      const duration = state.checkoutVariant?.label || state.checkoutProduct?.duration || '1 Tháng';
      const promo = await validatePromoCode(code, state.checkoutProduct?.id, duration);
      state.activeVoucher = promo;
      noteEl.hidden = false;
      noteEl.textContent = `Đã áp dụng ${promo.code}: ${promo.label}!`;
      noteEl.classList.remove('is-error');
      updateCheckoutPriceUi(state);
      showToast(`Áp dụng thành công mã ${promo.code}!`, 'success');
    } catch (err) {
      state.activeVoucher = null;
      noteEl.hidden = false;
      noteEl.textContent = err.message || 'Mã giảm giá không hợp lệ.';
      noteEl.classList.add('is-error');
      updateCheckoutPriceUi(state);
      showToast(err.message || 'Mã giảm giá không hợp lệ.', 'error');
    }
  });

  const handleOrderPaid = async (completedOrder) => {
    state.products = await fetchProducts();
    refreshCatalogUi();
    await refreshAccountData();
    renderDeliveredStep(completedOrder);
    if (completedOrder.status === 'PENDING_MANUAL') {
      showToast(`Đơn ${completedOrder.orderCode} đã thanh toán! Admin sẽ liên hệ qua Email/Zalo để cấp key.`, 'info');
      return;
    }
    showToast(`Đơn ${completedOrder.orderCode} đã thanh toán thành công!`, 'success');
  };

  document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.checkoutProduct) return;
    const contactInput = document.getElementById('checkout-contact');
    const errorEl = document.getElementById('checkout-contact-error');
    const contact = contactInput.value.trim();

    if (!CONTACT_REGEX.EMAIL.test(contact) && !CONTACT_REGEX.VN_PHONE.test(contact)) {
      errorEl.textContent = 'Vui lòng nhập Email hợp lệ hoặc SĐT Zalo Việt Nam (10 số).';
      errorEl.hidden = false;
      return showToast('Email hoặc SĐT Zalo chưa đúng định dạng.', 'error');
    }
    errorEl.hidden = true;
    const submitBtn = document.getElementById('checkout-create-btn');
    submitBtn.disabled = true;
    try {
      state.pendingOrder = await createOrder({
        productId: state.checkoutProduct.id,
        productSnapshot: state.checkoutProduct,
        quantity: Number.parseInt(qtyInput?.value, 10) || 1,
        contact,
        customUnitPrice: state.checkoutVariant?.price,
        customDuration: state.checkoutVariant?.label,
        accountType: state.checkoutVariant?.accountType,
        voucherCode: state.activeVoucher?.code || '',
      });
      renderVietQrStep(state.pendingOrder);
      pollOrderStatus(state.pendingOrder.orderCode, handleOrderPaid, 3000);
    } catch (err) {
      showToast(err.message || 'Không thể tạo đơn hàng.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('checkout-qr-step')?.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    if (!copyBtn) return;
    const label = copyBtn.dataset.copyLabel || 'Thông tin';
    if (copyBtn.dataset.copyValue) return copyText(copyBtn.dataset.copyValue, label, copyBtn);
    const targetEl = document.getElementById(copyBtn.dataset.copyTarget);
    if (targetEl) copyText(targetEl.textContent.trim(), label, copyBtn);
  });

  document.getElementById('check-order-status-btn')?.addEventListener('click', async (e) => {
    if (!state.pendingOrder) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const order = await fetchOwnOrderByCode(state.pendingOrder.orderCode);
      if ((order?.status === 'PAID' && order.credentials.length > 0) || order?.status === 'PENDING_MANUAL') {
        await handleOrderPaid(order);
      } else {
        showToast('Hệ thống chưa ghi nhận giao dịch. Vui lòng đợi vài giây rồi thử lại.', 'info');
      }
    } catch (err) {
      showToast(err.message || 'Không thể kiểm tra trạng thái đơn.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('simulate-paid-btn')?.addEventListener('click', async (e) => {
    if (!state.pendingOrder) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const completed = await confirmPaymentAndDeliver(state.pendingOrder.orderCode);
      await handleOrderPaid(completed);
    } catch (err) {
      showToast(err.message || 'Lỗi xác nhận thanh toán.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('copy-all-credentials-btn')?.addEventListener('click', (e) => {
    const text = document.getElementById('delivered-credentials')?.textContent || '';
    if (text) copyText(text, 'danh sách tài khoản', e.currentTarget);
  });

  document.getElementById('download-credentials-btn')?.addEventListener('click', () => {
    const code = document.getElementById('delivered-order-code')?.textContent || 'ACC';
    const text = document.getElementById('delivered-credentials')?.textContent || '';
    if (text) downloadTextFile(`${code}-accounts.txt`, text);
  });
}
