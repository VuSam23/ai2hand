export const SUPABASE_CONFIG = {
  restUrl: 'https://sfzsidgkqrilripijvft.supabase.co/rest/v1',
  publishableKey: 'sb_publishable_5wDbyVeSj8DIHnjN_3D6Ww_COgMLVT7',
  // Danh sách email được cấp quyền hiển thị & truy cập Admin Kho
  adminEmails: ['admin@gmail.com'],
};

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_CONFIG.restUrl &&
      SUPABASE_CONFIG.publishableKey &&
      SUPABASE_CONFIG.publishableKey.trim().length > 15
  );
}

export const VIETQR_CONFIG = {
  BANK_ID: '[MA_NGAN_HANG]',
  BANK_NAME: '[MA_NGAN_HANG]',
  ACCOUNT_NO: '[SO_TAI_KHOAN]',
  ACCOUNT_NAME: '[TEN_CHU_TAI_KHOAN]',
  TEMPLATE: 'compact2',
};

export const CATEGORIES = [
  'Tất cả',
  'Tài khoản AI',
  'Giải trí',
  'Key Phần mềm',
  'Acc Game',
];

export const DURATION_VARIANTS = [
  { label: '1 Tháng', multiplier: 1, discountNote: 'Chuẩn' },
  { label: '2 Tháng', multiplier: 1.9, discountNote: 'Tiết kiệm 5%' },
  { label: '3 Tháng', multiplier: 2.75, discountNote: 'Tiết kiệm 8%' },
  { label: '6 Tháng', multiplier: 5.2, discountNote: 'Tiết kiệm 13%' },
  { label: '12 Tháng', multiplier: 9.6, discountNote: 'Tiết kiệm 20%' },
];

export const ACCOUNT_TYPES = [
  {
    id: 'private',
    label: 'TK cấp sẵn',
    multiplier: 1,
    desc: 'Email + Password cấp sẵn kèm gói cước • Đối với Gmail chỉ hỗ trợ get OTP đăng nhập tối đa 2 lần, từ 2 lần trở lên tính phí 7.000đ/lượt',
  },
  {
    id: 'shared',
    label: 'Dùng chung',
    multiplier: 0.65,
    desc: 'Tiết kiệm chi phí • Bảo hành trọn kỳ',
  },
  {
    id: 'upgrade',
    label: 'Nâng cấp chính chủ',
    multiplier: 1.1,
    desc: 'Kích hoạt trực tiếp trên Email của bạn',
  },
];

export const VOUCHERS = {};

export const STORAGE_KEYS = {
  ORDERS: 'digitrust_orders_v1',
  PRODUCTS: 'digitrust_products_v1',
  USER: 'digitrust_user_v1',
  VAULT: 'digitrust_vault_v1',
};

export const STORAGE_SCHEMA_VERSION = 1;

export const CONTACT_REGEX = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  VN_PHONE: /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/,
};

export function buildVietQrUrl(amount, orderCode) {
  const { BANK_ID, ACCOUNT_NO, ACCOUNT_NAME, TEMPLATE } = VIETQR_CONFIG;
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: orderCode,
    accountName: ACCOUNT_NAME,
  });
  return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-${TEMPLATE}.png?${params.toString()}`;
}
