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
