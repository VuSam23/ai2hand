import { CONTACT_REGEX } from '../config/config.js';
import { getUserProfile, updateUserProfile } from '../services/supabaseApi.js';
import { adminLogin, adminLogout, userSignUp, userResetPassword, updateAuthPassword } from '../services/adminApi.js';
import { showToast, copyText } from './uiCommon.js';
import { syncAuthNavUi, renderAccountView } from './uiAccount.js';
import { switchAdminTab } from './uiAdminRender.js';

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

    const buyAgainBtn = e.target.closest('[data-action="buy-again"]');
    if (buyAgainBtn) {
      const target = state.products.find((p) => p.id === buyAgainBtn.dataset.productId);
      if (target && target.stock > 0) startCheckout(target.id);
      else if (target) openProductDetail(target.id);
      else switchView('home');
    }
  });

  let authMode = 'login';

  const resetPwdInputs = (isSignup) => {
    const pwd = document.getElementById('admin-auth-password');
    const confirmPwd = document.getElementById('admin-auth-confirm-password');
    const pwdToggle = document.getElementById('toggle-auth-password-btn');
    if (pwd) {
      pwd.type = 'password';
      pwd.value = '';
      if (typeof isSignup === 'boolean') pwd.autocomplete = isSignup ? 'new-password' : 'current-password';
    }
    if (confirmPwd) {
      confirmPwd.type = 'password';
      confirmPwd.value = '';
      if (typeof isSignup === 'boolean') confirmPwd.required = isSignup;
    }
    if (pwdToggle) {
      pwdToggle.textContent = 'Hiện';
      pwdToggle.setAttribute('aria-pressed', 'false');
      pwdToggle.setAttribute('aria-label', 'Hiện mật khẩu');
    }
  };

  const setAuthMode = (mode) => {
    authMode = mode;
    const isSignup = mode === 'signup';
    const badge = document.getElementById('admin-login-badge');
    const heading = document.getElementById('admin-login-heading');
    const subtitle = document.getElementById('admin-login-subtitle');
    const submitSpan = document.getElementById('admin-login-submit-btn')?.querySelector('span');
    const pwdHint = document.getElementById('auth-password-hint');
    const confirmGroup = document.getElementById('auth-confirm-password-group');
    const confirmHint = document.getElementById('auth-confirm-hint');
    const toggle = document.getElementById('auth-toggle-mode-btn');
    const forgot = document.getElementById('auth-forgot-btn');

    if (badge) badge.textContent = isSignup ? 'ĐĂNG KÝ THÀNH VIÊN' : 'Đăng nhập an toàn';
    if (heading) heading.textContent = isSignup ? 'Đăng Ký Tài Khoản Mới' : 'Đăng Nhập Tài Khoản';
    if (subtitle) {
      subtitle.textContent = isSignup
        ? 'Tạo tài khoản miễn phí để lưu lịch sử đơn hàng & bảo hành tự động.'
        : 'Đăng nhập để xem lịch sử đơn hàng & kho tài khoản đã mua.';
    }
    if (submitSpan) submitSpan.textContent = isSignup ? 'Tạo tài khoản' : 'Đăng nhập ngay';
    resetPwdInputs(isSignup);
    if (pwdHint) {
      pwdHint.hidden = !isSignup;
      pwdHint.classList.remove('is-error', 'is-valid');
      pwdHint.textContent = 'Mật khẩu tối thiểu 8 ký tự (nên có cả chữ và số).';
    }
    if (confirmGroup) confirmGroup.hidden = !isSignup;
    if (confirmHint) {
      confirmHint.hidden = true;
      confirmHint.classList.remove('is-error', 'is-valid');
      confirmHint.textContent = '';
    }
    if (toggle) toggle.textContent = isSignup ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký ngay';
    if (forgot) forgot.hidden = isSignup;
  };

  const finishAuth = async (session) => {
    state.userProfile = await getUserProfile();
    syncAuthNavUi();
    document.getElementById('admin-login-form')?.reset();
    showToast(session.isAdmin ? `Xin chào Admin ${session.email}!` : `Đăng nhập thành công: ${session.email}`, 'success');
    switchView(session.isAdmin ? 'admin' : 'account');
  };

  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('admin-auth-email')?.value || '').trim().toLowerCase();
    const password = document.getElementById('admin-auth-password')?.value || '';
    const confirmPwd = document.getElementById('admin-auth-confirm-password')?.value || '';

    if (authMode === 'signup') {
      const pwdHint = document.getElementById('auth-password-hint');
      const confirmHint = document.getElementById('auth-confirm-hint');
      if (pwdHint) {
        pwdHint.classList.remove('is-error', 'is-valid');
        pwdHint.textContent = 'Mật khẩu tối thiểu 8 ký tự (nên có cả chữ và số).';
      }
      if (confirmHint) {
        confirmHint.hidden = true;
        confirmHint.classList.remove('is-error', 'is-valid');
        confirmHint.textContent = '';
      }
      if (password.length < 8) {
        if (pwdHint) {
          pwdHint.hidden = false;
          pwdHint.textContent = `Cần nhập ít nhất 8 ký tự (hiện tại ${password.length}/8).`;
          pwdHint.classList.add('is-error');
        }
        return showToast('Mật khẩu cần tối thiểu 8 ký tự.', 'error');
      }
      if (confirmPwd !== password) {
        if (confirmHint) {
          confirmHint.hidden = false;
          confirmHint.textContent = 'Mật khẩu xác nhận chưa khớp.';
          confirmHint.classList.add('is-error');
        }
        return showToast('Mật khẩu xác nhận không khớp.', 'error');
      }
    }

    const submitBtn = document.getElementById('admin-login-submit-btn');
    const span = submitBtn?.querySelector('span');
    const prevText = span?.textContent || '';
    if (submitBtn) submitBtn.disabled = true;
    if (span) span.textContent = 'Đang xác thực...';
    try {
      if (authMode === 'signup') {
        const { needsConfirm } = await userSignUp(email, password);
        showToast(
          needsConfirm
            ? 'Đăng ký thành công! Vui lòng xác nhận email rồi đăng nhập để tiếp tục.'
            : 'Đăng ký tài khoản thành công! Vui lòng đăng nhập để tiếp tục.',
          'success'
        );
        setAuthMode('login');
        const emailInput = document.getElementById('admin-auth-email');
        if (emailInput) emailInput.value = email;
        return;
      }
      await finishAuth(await adminLogin(email, password));
    } catch (err) {
      showToast(err.message || 'Email hoặc mật khẩu không chính xác.', 'error');
    } finally {
      resetPwdInputs();
      if (submitBtn) submitBtn.disabled = false;
      if (span && span.textContent === 'Đang xác thực...') span.textContent = prevText;
    }
  });

  document.getElementById('toggle-auth-password-btn')?.addEventListener('click', (e) => {
    const pwd = document.getElementById('admin-auth-password');
    const confirmPwd = document.getElementById('admin-auth-confirm-password');
    if (!pwd) return;
    const show = pwd.type === 'password';
    pwd.type = show ? 'text' : 'password';
    if (confirmPwd) confirmPwd.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Ẩn' : 'Hiện';
    e.currentTarget.setAttribute('aria-pressed', String(show));
    e.currentTarget.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  });

  document.getElementById('auth-toggle-mode-btn')?.addEventListener('click', () => {
    setAuthMode(authMode === 'login' ? 'signup' : 'login');
  });

  document.getElementById('auth-forgot-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const msg = await userResetPassword(document.getElementById('admin-auth-email')?.value || '');
      showToast(msg, 'info');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('admin-logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('user-logout-btn')?.addEventListener('click', handleLogout);

  const filterOrders = () => renderAccountView(state.userProfile, state.orders, 'orders');
  document.getElementById('account-order-search')?.addEventListener('input', filterOrders);
  document.getElementById('account-order-status-filter')?.addEventListener('change', filterOrders);

  const closeRecovery = () => {
    const m = document.getElementById('recovery-modal');
    if (m) m.hidden = true;
    document.body.style.overflow = '';
  };
  document.getElementById('recovery-close-btn')?.addEventListener('click', closeRecovery);
  document.getElementById('recovery-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('recovery-password')?.value || '';
    if (pwd.length < 8) return showToast('Mật khẩu mới cần tối thiểu 8 ký tự.', 'error');
    if (pwd !== (document.getElementById('recovery-confirm')?.value || '')) return showToast('Mật khẩu xác nhận không khớp.', 'error');
    const btn = document.getElementById('recovery-submit-btn');
    if (btn) btn.disabled = true;
    try {
      await updateAuthPassword(pwd, window.__recoveryAccessToken || '');
      delete window.__recoveryAccessToken;
      e.target.reset();
      closeRecovery();
      showToast('Đã đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.', 'success');
      switchView('admin-login');
    } catch (err) {
      showToast(err.message || 'Không thể đặt lại mật khẩu.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

export function handlePasswordRecoveryHash() {
  const hash = String(window.location.hash || '').replace(/^#/, '');
  if (!hash.includes('type=recovery')) return;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token') || '';
  if (!accessToken || params.get('type') !== 'recovery') return;
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  window.__recoveryAccessToken = accessToken;
  const modal = document.getElementById('recovery-modal');
  if (modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('recovery-password')?.focus();
  }
}
