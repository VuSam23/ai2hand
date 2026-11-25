import { STORAGE_KEYS, STORAGE_SCHEMA_VERSION } from '../config/config.js';

export const DEFAULT_VAULT_OBJECT = {
  'chatgpt-plus': [
    'gpt4o.user01@ai2hand.vn|OpenAI#2026a',
    'gpt4o.user02@ai2hand.vn|OpenAI#2026b',
    'gpt4o.user03@ai2hand.vn|OpenAI#2026c',
    'gpt4o.user04@ai2hand.vn|OpenAI#2026d',
    'gpt4o.user05@ai2hand.vn|OpenAI#2026e',
  ],
  'claude-pro': [
    'claude.pro01@ai2hand.vn|Anthropic@99',
    'claude.pro02@ai2hand.vn|Anthropic@88',
    'claude.pro03@ai2hand.vn|Anthropic@77',
  ],
  'netflix-4k': [
    'nf4k.slot1@ai2hand.vn|Cine2026!|PIN:1102',
    'nf4k.slot2@ai2hand.vn|Cine2026!|PIN:2204',
    'nf4k.slot3@ai2hand.vn|Cine2026!|PIN:3306',
    'nf4k.slot4@ai2hand.vn|Cine2026!|PIN:4408',
  ],
  'youtube-premium': [
    'yt.family01@ai2hand.vn|InviteLink#YT2026',
    'yt.family02@ai2hand.vn|InviteLink#YT2027',
  ],
  'win11-pro-key': [
    'VK7JG-NPHTM-C97JM-9MPGT-3V66T|Online Activation',
    'W269N-WFGWX-YVC9B-4J6C9-T83GX|Online Activation',
    'MH37W-N47XK-V7XM9-C7227-GCQG9|Online Activation',
  ],
  'steam-random-vip': [],
};

export const DEFAULT_PRODUCTS = [
  {
    id: 'chatgpt-plus',
    name: 'ChatGPT Plus (GPT-4o & Canvas)',
    category: 'Tài khoản AI',
    duration: '1 Tháng',
    price: 89000,
    strikePrice: 120000,
    stock: 18,
    emblem: 'AI',
    tagline: 'GPT-4o • DALL-E 3 • Canvas Studio',
    description:
      'Mở full tính năng phân tích dữ liệu, tạo ảnh DALL-E 3 siêu nét, duyệt web thời gian thực và Canvas Studio.',
  },
  {
    id: 'claude-pro',
    name: 'Claude 3.5 Sonnet / Pro',
    category: 'Tài khoản AI',
    duration: '1 Tháng',
    price: 149000,
    strikePrice: 220000,
    stock: 9,
    emblem: 'CL',
    tagline: 'Claude 3.5 Sonnet • Artifacts • Coding',
    description:
      'Tài khoản riêng ổn định cao, hỗ trợ lập trình và viết nội dung chuyên sâu, bảo hành 1 đổi 1 suốt 30 ngày.',
  },
  {
    id: 'netflix-4k',
    name: 'Netflix Premium 4K UHD',
    category: 'Giải trí',
    duration: '1 Tháng',
    price: 49000,
    strikePrice: 90000,
    stock: 12,
    emblem: 'NF',
    tagline: '4K HDR • Profile Riêng • Mã PIN',
    description:
      'Xem phim 4K sắc nét trên SmartTV, điện thoại và máy tính. Profile riêng có mã PIN bảo mật lịch sử xem.',
  },
  {
    id: 'youtube-premium',
    name: 'YouTube Premium Chính Chủ',
    category: 'Giải trí',
    duration: '1 Tháng',
    price: 29000,
    strikePrice: 79000,
    stock: 25,
    emblem: 'YT',
    tagline: 'Không Quảng Cáo • Phát Nền • YT Music',
    description:
      'Nâng cấp trực tiếp trên Gmail cá nhân, chặn 100% quảng cáo trên mọi thiết bị và tặng kèm YouTube Music.',
  },
  {
    id: 'win11-pro-key',
    name: 'Key Windows 11 Pro Bản Quyền',
    category: 'Key Phần mềm',
    duration: 'Vĩnh viễn',
    price: 119000,
    strikePrice: 350000,
    stock: 7,
    emblem: 'W11',
    tagline: 'Retail Key • Kích Hoạt Online • 1 PC',
    description:
      'Key bản quyền chính hãng kích hoạt trực tuyến qua Settings, cập nhật Windows Update đầy đủ.',
  },
  {
    id: 'steam-random-vip',
    name: 'Acc Steam Random Game AAA',
    category: 'Acc Game',
    duration: 'Vĩnh viễn',
    price: 59000,
    strikePrice: 150000,
    stock: 0,
    emblem: 'GM',
    tagline: 'Tài Khoản Trắng Thông Tin • Đổi Pass',
    description:
      'Tài khoản Steam sở hữu ngẫu nhiên game AAA bản quyền, hỗ trợ đổi email và mật khẩu ngay sau khi nhận.',
  },
];

export const DEFAULT_USER_PROFILE = {
  name: 'Nguyễn Văn A',
  email: 'khachhang@gmail.com',
  phone: '0912345678',
  tier: 'Thành viên Bạc',
  joinedAt: '12/02/2026',
};

export const DEFAULT_DEMO_ORDERS = [
  {
    orderCode: 'ACC10258',
    productId: 'chatgpt-plus',
    productName: 'ChatGPT Plus (GPT-4o & Canvas)',
    quantity: 1,
    unitPrice: 89000,
    totalAmount: 89000,
    contact: 'khachhang@gmail.com',
    status: 'PAID',
    paidAt: '2026-11-22T07:32:00.000Z',
    credentials: ['openai.plus.vip1025@ai2hand.vn|ShopKeyPass#2026'],
  },
  {
    orderCode: 'ACC10241',
    productId: 'netflix-4k',
    productName: 'Netflix Premium 4K UHD',
    quantity: 1,
    unitPrice: 49000,
    totalAmount: 49000,
    contact: 'khachhang@gmail.com',
    status: 'PAID',
    paidAt: '2026-11-21T13:15:00.000Z',
    credentials: ['netflix.pro.slot4@ai2hand.vn|Cine2026!|PIN:8899'],
  },
  {
    orderCode: 'ACC09982',
    productId: 'win11-pro-key',
    productName: 'Key Windows 11 Pro Bản Quyền',
    quantity: 1,
    unitPrice: 119000,
    totalAmount: 119000,
    contact: '0912345678',
    status: 'PAID',
    paidAt: '2026-11-18T09:20:00.000Z',
    credentials: ['W269N-WFGWX-YVC9B-4J6C9-T83GX|Online Activation'],
  },
];

export function safeStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) return fallback;
    return parsed.data ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeStorageSet(key, data) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: STORAGE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        data,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function resetAllDemoStorage() {
  safeStorageSet(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
  safeStorageSet(STORAGE_KEYS.VAULT, DEFAULT_VAULT_OBJECT);
  safeStorageSet(STORAGE_KEYS.USER, DEFAULT_USER_PROFILE);
  safeStorageSet(STORAGE_KEYS.ORDERS, DEFAULT_DEMO_ORDERS);
}
