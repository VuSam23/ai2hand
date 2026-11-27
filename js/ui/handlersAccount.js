import { CONTACT_REGEX } from '../config/config.js';
import { updateUserProfile } from '../services/supabaseApi.js';
import { adminLogout } from '../services/adminApi.js';
import { showToast, copyText } from './uiCommon.js';
import { syncAuthNavUi, renderAccountView } from './uiAccount.js';
import { openPrebuiltGuideModal } from './uiPrebuiltGuide.js';
import { switchAdminTab } from './uiAdminRender.js';
import { bindAuthEvents, handlePasswordRecoveryHash } from './handlersAuth.js';

export { handlePasswordRecoveryHash };

export function bindAccountAndAdminEvents({ state, startCheckout, openProductDetail, switchView }) {
  const toggleProfileEditor = (forceOpen) => {
    const card = document.getElementById('acc-profile-card');
    if (!card) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : card.hidden;
    card.hidden = !shouldOpen;
    if (shouldOpen) document.getElementById('acc-input-name')?.focus();
  };

  const handleLogout = () => {
    adminLogout();
    switchAdminTab('stats');
    toggleProfileEditor(false);
    syncAuthNavUi();
    showToast('Đã đăng xuất tài khoản.', 'info');
    switchView('admin-login');
  };

  const switchAccountTab = (tabName) => {
    const isOrders = tabName === 'orders';
    const tabOverview = document.getElementById('acc-tab-overview');
    const tabOrders = document.getElementById('acc-tab-orders');
    if (tabOverview) tabOverview.hidden = isOrders;
    if (tabOrders) tabOrders.hidden = !isOrders;
    document.getElementById('acc-nav-overview')?.classList.toggle('is-active', tabName === 'overview');
    document.getElementById('acc-nav-orders')?.classList.toggle('is-active', isOrders);
    document.getElementById('acc-nav-profile')?.classList.toggle('is-active', tabName === 'profile');
  };

  document.getElementById('acc-toggle-edit-btn')?.addEventListener('click', () => toggleProfileEditor());
  document.getElementById('acc-cancel-edit-btn')?.addEventListener('click', () => toggleProfileEditor(false));
  document.getElementById('acc-nav-overview')?.addEventListener('click', () => {
    switchAccountTab('overview');
    toggleProfileEditor(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('acc-nav-orders')?.addEventListener('click', () => {
    switchAccountTab('orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('acc-nav-profile')?.addEventListener('click', () => {
    switchAccountTab('profile');
    toggleProfileEditor(true);
  });

  document.getElementById('acc-profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById('acc-input-name')?.value.trim() || '';
      const email = document.getElementById('acc-input-email')?.value.trim() || '';
      const phone = document.getElementById('acc-input-phone')?.value.trim() || '';
      if (!CONTACT_REGEX.EMAIL.test(email)) return showToast('Email không đúng định dạng.', 'error');
      if (phone && !CONTACT_REGEX.VN_PHONE.test(phone)) return showToast('SĐT Zalo phải gồm 10 số.', 'error');
      state.userProfile = await updateUserProfile({ name, email, phone });
      renderAccountView(state.userProfile, state.orders);
      toggleProfileEditor(false);
      showToast('Đã lưu thông tin tài khoản!', 'success');
    } catch (err) {
      showToast(err.message || 'Không thể lưu thông tin.', 'error');
    }
  });

  document.getElementById('account-orders-tbody')?.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy-raw]');
    if (copyBtn) return copyText(copyBtn.dataset.copyRaw, 'tài khoản', copyBtn);
    const maskBtn = e.target.closest('[data-action="toggle-cred-mask"]');
    if (maskBtn) {
      const codeEl = maskBtn.closest('.acc-cred-pill')?.querySelector('code[data-raw]');
      if (!codeEl) return;
      const nextMask = codeEl.dataset.masked !== 'true';
      codeEl.dataset.masked = String(nextMask);
      codeEl.textContent = nextMask ? codeEl.dataset.mask : codeEl.dataset.raw;
      maskBtn.innerHTML = `<span>${nextMask ? '👁️ Hiện' : '🙈 Ẩn'}</span>`;
      return;
    }
    const guideBtn = e.target.closest('[data-action="open-prebuilt-guide"]');
    if (guideBtn) return openPrebuiltGuideModal(guideBtn.dataset.duration || '');
    const buyAgainBtn = e.target.closest('[data-action="buy-again"]');
    if (buyAgainBtn) {
      const target = state.products.find((p) => p.id === buyAgainBtn.dataset.productId);
      if (target && target.stock > 0) startCheckout(target.id);
      else if (target) openProductDetail(target.id);
      else switchView('home');
    }
  });

  document.getElementById('admin-logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('user-logout-btn')?.addEventListener('click', handleLogout);

  const filterOrders = () => renderAccountView(state.userProfile, state.orders, 'orders');
  document.getElementById('account-order-search')?.addEventListener('input', filterOrders);
  document.getElementById('account-order-status-filter')?.addEventListener('change', filterOrders);

  bindAuthEvents({ state, switchView });
}
