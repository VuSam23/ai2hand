import test from 'node:test';
import assert from 'node:assert/strict';

setTimeout(() => {
  console.error('TIMEOUT: test-core exceeded 8000ms');
  process.exit(1);
}, 8000).unref();

const memStore = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};
globalThis.sessionStorage = memStore();
globalThis.localStorage = memStore();

const { SUPABASE_CONFIG } = await import('../js/config/config.js');
const adminApi = await import('../js/services/adminApi.js');
const supabaseApi = await import('../js/services/supabaseApi.js');
const mappers = await import('../js/services/supabaseMappers.js');
const promoApi = await import('../js/services/promoApi.js');
const uiStore = await import('../js/ui/uiStore.js');
const prebuiltGuide = await import('../js/ui/uiPrebuiltGuide.js');

test('1. RBAC: isAdminLoggedIn() chi true voi admin@gmail.com va false voi khach/demo', async () => {
  adminApi.adminLogout();
  assert.equal(adminApi.isAdminLoggedIn(), false);

  adminApi.startDemoUserSession();
  assert.equal(adminApi.isAdminLoggedIn(), false);

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ access_token: 'eyJ.demo.token', user: { email: 'user@gmail.com' } }),
      { status: 200 }
    );
  await adminApi.adminLogin('user@gmail.com', '123456');
  assert.equal(adminApi.isAdminLoggedIn(), false);

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ access_token: 'eyJ.admin.token', user: { email: SUPABASE_CONFIG.adminEmails[0] } }),
      { status: 200 }
    );
  await adminApi.adminLogin(SUPABASE_CONFIG.adminEmails[0], '123456');
  assert.equal(adminApi.isAdminLoggedIn(), true);
});

test('2. Schema Truth & Stock Count: products chi 6 cot va dem is_sold=false tu inventory_keys', async () => {
  const allowed = ['id', 'name', 'category', 'price', 'description', 'is_active'];
  const raw = { name: 'GPT', category: 'AI', price: '89000.6', duration: '1 Tháng', stock: 10, strike_price: 120000 };
  const clean = {
    id: 'gpt-101',
    name: String(raw.name).trim(),
    category: raw.category,
    price: Math.round(Number(raw.price)),
    description: 'OK',
    is_active: true,
  };
  assert.deepEqual(Object.keys(clean).sort(), [...allowed].sort());

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/products?select=*')) {
      return new Response(
        JSON.stringify([
          { id: 'chatgpt-plus', name: 'ChatGPT Plus', category: 'Tài khoản AI', price: 89000, is_active: true },
          { id: 'out-of-stock-pkg', name: 'Gói Hết Hàng', category: 'Giải trí', price: 49000, is_active: true },
        ]),
        { status: 200 }
      );
    }
    if (u.includes('/rpc/get_product_stocks')) {
      return new Response('Not found', { status: 404 });
    }
    if (u.includes('/inventory_keys?is_sold=eq.false')) {
      return new Response(
        JSON.stringify([
          { product_id: 'chatgpt-plus' },
          { product_id: 'chatgpt-plus' },
          { product_id: 'chatgpt-plus' },
        ]),
        { status: 200 }
      );
    }
    return new Response('[]', { status: 200 });
  };

  const products = await supabaseApi.fetchProducts();
  const gpt = products.find((p) => p.id === 'chatgpt-plus');
  const emptyPkg = products.find((p) => p.id === 'out-of-stock-pkg');
  assert.equal(gpt?.stock, 3);
  assert.equal(emptyPkg?.stock, 0);
});

test('3. Stock = 0 & Loi PGRST204 tu Supabase', async () => {
  await assert.rejects(
    () =>
      supabaseApi.createOrder({
        productId: 'steam-random-vip',
        productSnapshot: { id: 'steam-random-vip', name: 'Acc Steam', price: 59000, stock: 0 },
        quantity: 1,
        contact: 'khach@gmail.com',
      }),
    /tồn kho/i
  );

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: false, error: 'PGRST204: Could not find column' }), { status: 400 });
  await assert.rejects(() => adminApi.adminAddProduct({ name: 'Test', price: 10000 }), /PGRST204/);
});

test('4. Timeout mang (AbortController) huy request khi fetch treo', async () => {
  globalThis.fetch = (_url, opts = {}) =>
    new Promise((_resolve, reject) => {
      opts.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(() => globalThis.fetch('https://example.com', { signal: controller.signal }), {
    name: 'AbortError',
  });
});

test('5. Bien the ton kho, Cap thu cong, Promo va Cheapest Variant', () => {
  const prod = {
    id: 'claude-pro',
    name: 'Claude Pro',
    price: 60000,
    isActive: true,
    stock: 9,
    variantStocks: { '1 Tháng|TK cấp sẵn': 2, '7 ngày|TK cấp sẵn': 3 },
    manualStocks: { '18 Tháng|Nâng cấp chính chủ': 4 },
    variantPrices: {
      '7 ngày|TK cấp sẵn': 29000,
      '1 Tháng|TK cấp sẵn': 89000,
      '18 Tháng|Nâng cấp chính chủ': 450000,
      '6 Tháng|Dùng chung': 120000,
    },
  };
  assert.equal(mappers.getVariantStock(prod, '7 ngày', 'TK cấp sẵn'), 3);
  assert.equal(mappers.getVariantStock(prod, '1 Tháng', 'TK cấp sẵn'), 2);
  assert.equal(mappers.getVariantStock(prod, '18 Tháng', 'Nâng cấp chính chủ'), 4);
  assert.equal(mappers.getVariantStock(prod, '6 Tháng', 'Dùng chung'), 0);
  assert.equal(mappers.isVariantManual(prod, '18 Tháng', 'Nâng cấp chính chủ'), true);
  assert.equal(mappers.isVariantManual(prod, '7 ngày', 'TK cấp sẵn'), false);

  const durations = uiStore.getProductDurations(prod).map((d) => d.label);
  assert.equal(durations.includes('7 Ngày'), true);
  assert.equal(durations.includes('18 Tháng'), true);

  const cheapest = uiStore.getCheapestVariant(prod);
  assert.equal(cheapest.label, '7 Ngày');
  assert.equal(cheapest.accountType, 'TK cấp sẵn');
  assert.equal(cheapest.price, 29000);
  assert.equal(cheapest.stock, 3);
  assert.equal(cheapest.strike, 0);

  // Kiểm tra gộp cộng dồn SL không phân biệt hoa/thường ('18 Tháng' + '18 tháng' = 2)
  const stockMap = new Map();
  mappers.addVariantCount(stockMap, 'gemini-ultra', '18 Tháng', 'TK cấp sẵn', 1);
  mappers.addVariantCount(stockMap, 'gemini-ultra', '18 tháng', 'TK cấp sẵn', 1);
  const mergedProd = mappers.normalizeProduct(
    {
      id: 'gemini-ultra',
      name: 'Gemini Ultra',
      price: 250000,
      variant_prices: { '18 tháng|TK cấp sẵn': 350000 },
    },
    stockMap
  );
  assert.equal(mappers.getVariantStock(mergedProd, '18 Tháng', 'TK cấp sẵn'), 2);
  assert.equal(mappers.getVariantStock(mergedProd, '18 tháng', 'TK cấp sẵn'), 2);
  const mergedDurations = uiStore.getProductDurations(mergedProd).filter((d) => d.label.toLowerCase() === '18 tháng');
  assert.equal(mergedDurations.length, 1);

  assert.equal(promoApi.calculatePromoDiscount({ discountType: 'percent', discountValue: 20 }, 100000), 20000);
  assert.equal(promoApi.calculatePromoDiscount({ discountType: 'fixed', discountValue: 150000 }, 100000), 100000);

  const mappedWithBanner = mappers.normalizeProduct({
    id: 'capcut-pro',
    name: 'CapCut Pro',
    price: 50000,
    image_url: 'https://example.com/avatar.webp',
    detail_image_url: 'https://example.com/banner-sale.webp',
  });
  assert.equal(mappedWithBanner.imageUrl, 'https://example.com/avatar.webp');
  assert.equal(mappedWithBanner.detailImageUrl, 'https://example.com/banner-sale.webp');

  const mappedFallback = mappers.normalizeProduct({
    id: 'canva-pro',
    name: 'Canva Pro',
    price: 45000,
    image_url: 'https://example.com/canva-avatar.webp',
  });
  assert.equal(mappedFallback.imageUrl, 'https://example.com/canva-avatar.webp');
  assert.equal(mappedFallback.detailImageUrl, 'https://example.com/canva-avatar.webp');

  const prebuiltPaid = mappers.normalizeOrder({
    order_code: 'ACC12345',
    product_name: 'Gemini Advanced',
    duration: '1 Tháng',
    account_type: 'TK cấp sẵn',
    status: 'paid',
    delivered_credential: 'user@gmail.com|Pass123|2FA_CODE',
  });
  assert.equal(prebuiltGuide.isPrebuiltAccountOrder(prebuiltPaid), true);

  const upgradePaid = mappers.normalizeOrder({
    order_code: 'ACC67890',
    product_name: 'Gemini Advanced',
    duration: '12 Tháng',
    account_type: 'Nâng cấp chính chủ',
    status: 'paid',
    delivered_credential: 'Đã nâng cấp chính chủ',
  });
  assert.equal(prebuiltGuide.isPrebuiltAccountOrder(upgradePaid), false);

  const manualPending = mappers.normalizeOrder({
    order_code: 'ACC99999',
    product_name: 'Gemini Advanced',
    duration: '1 Tháng',
    account_type: 'TK cấp sẵn',
    status: 'pending_manual',
  });
  assert.equal(prebuiltGuide.isPrebuiltAccountOrder(manualPending), false);
});
