import { fetchProducts, lookupOrders, getUserProfile } from './services/supabaseApi.js';
import { captureTrafficSource } from './services/trafficSource.js';
import {
  adminListOrders,
  adminListPromos,
  getAdminSession,
  isUserLoggedIn,
  isAdminLoggedIn,
} from './services/adminApi.js';
import { showToast } from './ui/uiCommon.js';
import { renderCategories, renderProductDetail, renderProductGrid, getCheapestVariant } from './ui/uiStore.js';
import { openCheckoutModal, closeCheckoutModal, bindCheckoutEvents, handlePaymentReturnUrl } from './ui/uiCheckout.js';
import {
  syncAuthNavUi,
  renderAccountView,
} from './ui/uiAccount.js';
import { renderAdminView, bindAdminEvents } from './ui/uiAdmin.js';
import { bindAccountAndAdminEvents } from './ui/handlersAccount.js';

const state = {
  products: [],
  userProfile: null,
  orders: [],
  activeCategory: 'Tất cả',
  priceRange: 'all',
  sortBy: 'default',
  searchQuery: '',
  activeView: 'home',
  selectedProductId: null,
  selectedVariantIndex: 0,
  selectedAccountTypeId: 'private',
  checkoutProduct: null,
  checkoutVariant: null,
  activeVoucher: null,
  pendingOrder: null,
};

function matchPriceRange(price, range) {
  if (range === 'under_50') return price < 50000;
  if (range === '50_100') return price >= 50000 && price <= 100000;
  if (range === '100_200') return price > 100000 && price <= 200000;
  if (range === 'above_200') return price > 200000;
  return true;
}

function getFilteredProducts() {
  const query = state.searchQuery.trim().toLowerCase();
  const displayPrice = (item) => getCheapestVariant(item).price || item.price;
  const filtered = state.products.filter((item) => {
    const matchCat = state.activeCategory === 'Tất cả' || item.category === state.activeCategory;
    const matchQ = !query || item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
    return matchCat && matchQ && matchPriceRange(displayPrice(item), state.priceRange);
  });
  if (state.sortBy === 'price_asc') return [...filtered].sort((a, b) => displayPrice(a) - displayPrice(b));
  if (state.sortBy === 'price_desc') return [...filtered].sort((a, b) => displayPrice(b) - displayPrice(a));
  return filtered;
}

function refreshCatalogUi() {
  renderCategories(state.activeCategory, state.products);
  renderProductGrid(getFilteredProducts());
  if (isAdminLoggedIn()) renderAdminView(state.products);
  if (state.selectedProductId) {
    const detailProd = state.products.find((p) => p.id === state.selectedProductId);
    if (detailProd) {
      renderProductDetail(detailProd, state.selectedVariantIndex, state.selectedAccountTypeId);
    }
  }
}

function resetAllFilters() {
  state.activeCategory = 'Tất cả';
  state.priceRange = 'all';
  state.sortBy = 'default';
  state.searchQuery = '';
  ['global-search', 'mobile-search'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const sortSelect = document.getElementById('catalog-sort');
  const allPriceRadio = document.querySelector('input[name="price_filter"][value="all"]');
  if (sortSelect) sortSelect.value = 'default';
  if (allPriceRadio) allPriceRadio.checked = true;
  refreshCatalogUi();
}

async function refreshAccountData(defaultTab = 'overview') {
  state.userProfile = await getUserProfile();
  const session = getAdminSession();
  const filterEmail = session && !session.isDemo ? session.email : '';
  state.orders = await lookupOrders(filterEmail);
  renderAccountView(state.userProfile, state.orders, defaultTab);
}

function switchView(requestedView) {
  syncAuthNavUi();
  let viewName = requestedView || 'home';
  let accountTab = 'overview';
  if (viewName === 'my-orders') {
    viewName = 'account';
    accountTab = 'orders';
  }

  if (viewName === 'account' && !isUserLoggedIn()) {
    viewName = 'admin-login';
  } else if (viewName === 'admin') {
    if (!isUserLoggedIn()) {
      showToast('Vui lòng đăng nhập tài khoản Admin.', 'info');
      viewName = 'admin-login';
    } else if (!isAdminLoggedIn()) {
      showToast('Tài khoản của bạn không có quyền truy cập Admin Kho.', 'error');
      viewName = 'account';
    }
  }

  state.activeView = viewName;
  document.body.classList.toggle('is-detail-view', viewName === 'product-detail');
  document.querySelectorAll('.tab-view').forEach((sec) => {
    sec.hidden = sec.id !== `view-${viewName}`;
  });
  const navHighlight =
    viewName === 'product-detail' ? 'home' : viewName === 'admin-login' ? 'account' : requestedView === 'my-orders' ? 'my-orders' : viewName;
  document.querySelectorAll('[data-tab], [data-view]').forEach((btn) => {
    const targetTab = btn.dataset.tab || btn.dataset.view;
    btn.classList.toggle('is-active', targetTab === navHighlight);
  });

  if (viewName === 'home') renderProductGrid(getFilteredProducts());
  if (viewName === 'account') refreshAccountData(accountTab);
  if (viewName === 'admin' && isAdminLoggedIn()) {
    renderAdminView(state.products);
    Promise.all([adminListOrders(), adminListPromos()])
      .then(([orders, promos]) => renderAdminView(state.products, orders, promos))
      .catch((err) => showToast(err.message || 'Không thể tải dữ liệu Admin.', 'error'));
  }
}

function openProductDetail(productId) {
  const target = state.products.find((p) => p.id === productId);
  if (!target) return;
  const cheapest = getCheapestVariant(target);
  state.selectedProductId = target.id;
  state.selectedVariantIndex = cheapest.variantIndex;
  state.selectedAccountTypeId = cheapest.accountTypeId;
  renderProductDetail(target, cheapest.variantIndex, cheapest.accountTypeId);
  switchView('product-detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startCheckout(productId, variantOverride = null) {
  if (!isUserLoggedIn()) {
    showToast('Vui lòng đăng nhập hoặc tạo tài khoản để mua hàng và lưu trữ key vĩnh viễn.', 'info');
    return switchView('admin-login');
  }
  const product = state.products.find((p) => p.id === productId);
  if (!product) return showToast('Không tìm thấy gói sản phẩm.', 'error');
  const chosen = variantOverride || getCheapestVariant(product);
  const availStock = chosen.stock !== undefined ? Number(chosen.stock) : product.stock || 0;
  if (availStock === 0) return showToast('Biến thể hoặc gói này hiện đã hết hàng.', 'error');
  openCheckoutModal(state, product, chosen);
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const tabTrigger = e.target.closest('[data-tab], [data-view]');
    if (!tabTrigger) return;
    if (tabTrigger.tagName === 'A') e.preventDefault();
    switchView(tabTrigger.dataset.tab || tabTrigger.dataset.view);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCheckoutModal();
  });

  document.getElementById('back-to-home-btn')?.addEventListener('click', () => {
    switchView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const toggleMobileSidebar = () => {
    if (state.activeView !== 'home') switchView('home');
    const sidebar = document.getElementById('home-sidebar');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('is-open');
    ['header-filter-toggle', 'mobile-filter-toggle'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.classList.toggle('is-active', isOpen);
        btn.setAttribute('aria-expanded', String(isOpen));
      }
    });
    if (isOpen) sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  document.getElementById('header-filter-toggle')?.addEventListener('click', toggleMobileSidebar);
  document.getElementById('mobile-filter-toggle')?.addEventListener('click', toggleMobileSidebar);

  const globalSearch = document.getElementById('global-search');
  const mobileSearch = document.getElementById('mobile-search');
  [globalSearch, mobileSearch].forEach((input) => {
    input?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (globalSearch && input !== globalSearch) globalSearch.value = state.searchQuery;
      if (mobileSearch && input !== mobileSearch) mobileSearch.value = state.searchQuery;
      if (state.activeView !== 'home') switchView('home');
      renderProductGrid(getFilteredProducts());
    });
  });

  document.getElementById('category-filters')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    state.activeCategory = chip.dataset.category;
    refreshCatalogUi();
  });

  document.getElementById('price-filters')?.addEventListener('change', (e) => {
    if (e.target.name === 'price_filter') {
      state.priceRange = e.target.value;
      renderProductGrid(getFilteredProducts());
    }
  });

  document.getElementById('catalog-sort')?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderProductGrid(getFilteredProducts());
  });

  document.getElementById('product-grid')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="reset-filters"]')) return resetAllFilters();
    const buyBtn = e.target.closest('.btn-buy-now');
    if (buyBtn) {
      e.stopPropagation();
      const { id, variantLabel, accountType, variantPrice, variantStock } = buyBtn.dataset;
      return startCheckout(
        id,
        variantLabel
          ? { label: variantLabel, accountType, price: Number(variantPrice) || 0, stock: Number(variantStock) || 0 }
          : null
      );
    }
    const card = e.target.closest('.product-card');
    if (card?.dataset.productId) openProductDetail(card.dataset.productId);
  });

  document.getElementById('detail-duration-options')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-variant-index]');
    if (!btn || btn.disabled || btn.classList.contains('is-disabled') || !state.selectedProductId) return;
    state.selectedVariantIndex = Number(btn.dataset.variantIndex) || 0;
    const prod = state.products.find((p) => p.id === state.selectedProductId);
    if (prod) renderProductDetail(prod, state.selectedVariantIndex, state.selectedAccountTypeId);
  });

  document.getElementById('detail-account-types')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type-id]');
    if (!btn || btn.disabled || btn.classList.contains('is-disabled') || !state.selectedProductId) return;
    state.selectedAccountTypeId = btn.dataset.typeId;
    const prod = state.products.find((p) => p.id === state.selectedProductId);
    if (prod) renderProductDetail(prod, state.selectedVariantIndex, state.selectedAccountTypeId);
  });

  document.getElementById('hero-buy-btn')?.addEventListener('click', (e) => {
    const { productId, variantPrice, variantLabel, accountType, variantStock } =
      e.currentTarget.dataset;
    if (productId) {
      startCheckout(productId, {
        price: Number(variantPrice) || 0,
        label: variantLabel || '',
        accountType: accountType || '',
        stock: variantStock !== undefined ? Number(variantStock) : undefined,
      });
    }
  });

  bindCheckoutEvents({ state, refreshCatalogUi, refreshAccountData });
  bindAccountAndAdminEvents({ state, refreshAccountData, startCheckout, openProductDetail, switchView });
  bindAdminEvents({ state, refreshCatalogUi, refreshAccountData });
}

async function initApp() {
  captureTrafficSource();
  syncAuthNavUi();
  bindEvents();
  try {
    state.products = await fetchProducts();
    refreshCatalogUi();
    if (isUserLoggedIn()) await refreshAccountData();
    const hash = window.location.hash.replace(/^#/, '');
    if (hash === 'admin' || hash === 'admin-login' || hash === 'account') {
      switchView(hash);
    }
    await handlePaymentReturnUrl({ switchView, refreshAccountData });
  } catch {
    showToast('Không thể tải dữ liệu cửa hàng.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', initApp);
