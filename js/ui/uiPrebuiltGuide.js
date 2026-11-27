/**
 * js/ui/uiPrebuiltGuide.js — Tầng 3: Hướng dẫn đăng nhập 2FA & Chính sách bảo hành cho Tài khoản cấp sẵn
 */
import { PREBUILT_2FA_VIDEO_URL } from '../config/config.js';
import { escapeHtml } from './uiCommon.js';

export function maskCredentialText(rawText = '') {
  return String(rawText || '')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.includes('|')) return trimmed;
      const parts = trimmed.split('|');
      return [parts[0], ...parts.slice(1).map((_, idx) => (idx === 0 ? '••••••••' : '••••••'))].join('|');
    })
    .join('\n');
}

export function isPrebuiltAccountOrder(order) {
  if (!order) return false;
  const st = String(order.status || '').toUpperCase();
  if (st === 'PENDING_MANUAL' || st === 'PENDING') return false;
  const rawType = `${order.accountType || ''} ${order.account_type || ''} ${order.productName || ''} ${order.product_name || ''}`.toLowerCase();
  if (rawType.includes('chính chủ')) return false;
  if (rawType.includes('cấp sẵn') || rawType.includes('cap san')) return true;
  return !order.accountType && !order.account_type && !rawType.includes('dùng chung') && Array.isArray(order.credentials) && order.credentials.length > 0;
}

export function buildPrebuiltGuideFullHtml(durationLabel = '') {
  const videoUrl = String(PREBUILT_2FA_VIDEO_URL || '').trim();
  const hasVideo = /^https:\/\/(www\.)?(youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)/i.test(videoUrl);
  const warrantyScope = durationLabel
    ? `07 ngày (hoặc trọn thời hạn gói ${escapeHtml(durationLabel)} ghi trên đơn hàng)`
    : '07 ngày (hoặc theo thời hạn gói ghi trên đơn hàng)';

  const videoSectionHtml = hasVideo
    ? `<div class="prebuilt-section">
        <h4>🎬 Video hướng dẫn thao tác mã 2FA (Tài khoản cấp sẵn)</h4>
        <div class="prebuilt-video-frame">
          <iframe src="${escapeHtml(videoUrl)}" title="Video hướng dẫn thao tác mã 2FA tài khoản cấp sẵn" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
      </div>`
    : `<div class="prebuilt-section">
        <h4>🎬 Hướng dẫn thao tác mã 2FA (Tài khoản cấp sẵn)</h4>
        <p class="prebuilt-video-note">Khi đăng nhập lần đầu, chọn phương thức xác minh bằng <strong>Mã 2FA / Mã dự phòng</strong> đi kèm tài khoản. Sau 2–7 ngày khi thiết bị đã ổn định, bạn có thể vào <code>myaccount.google.com/security</code> để làm mới mã 2FA riêng.</p>
      </div>`;

  return `
    <div class="prebuilt-guide-grid">
      <div class="prebuilt-section">
        <h4>1️⃣ Đăng nhập lần đầu (Tránh khóa do lạ IP)</h4>
        <ul class="prebuilt-list">
          <li><strong>Tắt VPN / Proxy / 1.1.1.1</strong> trên thiết bị trước khi thao tác đăng nhập.</li>
          <li>Ưu tiên đăng nhập trên <strong>điện thoại trước (qua app Gmail)</strong>, hoặc mở <strong>1 Hồ sơ Chrome mới (New Profile)</strong> sạch trên máy tính (không đăng nhập chung trình duyệt đang chứa nhiều Gmail khác).</li>
          <li>Nhập <code>Email | Mật khẩu</code> → chọn nhập <strong>Mã 2FA / Mã dự phòng</strong> đi kèm để hoàn tất xác minh.</li>
          <li class="prebuilt-highlight"><strong>⚠️ Điều kiện bảo hành bắt buộc:</strong> Quay video màn hình liền mạch từ lúc bắt đầu nhập tài khoản lần đầu tiên cho đến khi kiểm tra gói cước để được hỗ trợ <strong>1 đổi 1 ngay lập tức</strong> nếu phát sinh lỗi sai mật khẩu hoặc thiếu gói.</li>
        </ul>
      </div>

      <div class="prebuilt-section">
        <h4>2️⃣ Quy tắc sử dụng 7 – 10 ngày đầu</h4>
        <ul class="prebuilt-list">
          <li>Chỉ dùng cố định trên tối đa <strong>2 thiết bị cá nhân</strong> (1 điện thoại + 1 máy tính) với mạng Wi-Fi/4G ổn định; không chia sẻ tài khoản dùng chung nhiều người.</li>
          <li><strong>Không đổi mật khẩu, email khôi phục hay 2FA trong 48 giờ đầu.</strong> Sau 2–7 ngày khi tài khoản đã quen thiết bị mới, có thể vào <code>myaccount.google.com/security</code> để đổi mật khẩu và tạo 2FA riêng.</li>
        </ul>
      </div>

      ${videoSectionHtml}

      <div class="prebuilt-section is-warning">
        <h4>3️⃣ Lưu ý cấm &amp; 🛡️ Chính sách bảo hành (Từ chối bảo hành nếu vi phạm)</h4>
        <ul class="prebuilt-list">
          <li><strong>Không đụng vào phần Thanh toán (<code>pay.google.com</code>):</strong> Tuyệt đối không xóa phương thức thanh toán, đóng hồ sơ hoặc đổi quốc gia để tránh mất gói Gemini.</li>
          <li><strong>Không cắm tool / API tự động:</strong> Chỉ sử dụng trực tiếp trên web hoặc app chính thức (<code>gemini.google.com</code>).</li>
          <li>Không lưu trữ dữ liệu/tài liệu cá nhân quan trọng lên Google Drive của tài khoản này (shop không chịu trách nhiệm sao lưu dữ liệu).</li>
          <li><strong>Phạm vi &amp; Hình thức bảo hành:</strong> Bảo hành đăng nhập lần đầu và lỗi gói cước trong vòng <strong>${warrantyScope}</strong> kể từ lúc bàn giao. Đổi tài khoản mới tương đương hoặc hoàn tiền theo thời gian chưa sử dụng; từ chối bảo hành nếu khóa do vi phạm các lưu ý trên.</li>
        </ul>
      </div>
    </div>
  `;
}

export function renderPrebuiltAccountGuideHtml({ compact = false, durationLabel = '' } = {}) {
  const safeDur = escapeHtml(durationLabel || '');
  if (compact) {
    return `
      <div class="prebuilt-pill-wrap">
        <button type="button" class="prebuilt-guide-pill-btn" data-action="open-prebuilt-guide" data-duration="${safeDur}">
          <span>🛡️ Hướng dẫn 2FA &amp; Bảo hành</span>
        </button>
      </div>
    `;
  }

  return `
    <div class="prebuilt-quick-box">
      <div class="prebuilt-quick-head">
        <strong>🛡️ Lưu ý quan trọng cho Tài khoản cấp sẵn</strong>
        <button type="button" class="prebuilt-guide-pill-btn" data-action="open-prebuilt-guide" data-duration="${safeDur}">
          Xem đầy đủ hướng dẫn 2FA &amp; Bảo hành ▸
        </button>
      </div>
      <ul class="prebuilt-quick-list">
        <li><strong>1. Quay video màn hình liền mạch</strong> khi đăng nhập lần đầu để được bảo hành <strong>1 đổi 1 tức thì</strong>.</li>
        <li><strong>2. Tắt VPN/1.1.1.1</strong>, đăng nhập trên Profile Chrome sạch và <strong>không đổi mật khẩu / 2FA trong 48h đầu</strong>.</li>
      </ul>
    </div>
  `;
}

export function openPrebuiltGuideModal(durationLabel = '') {
  const modal = document.getElementById('app-dialog-modal');
  const eyebrow = document.getElementById('app-dialog-eyebrow');
  const title = document.getElementById('app-dialog-title');
  const body = document.getElementById('app-dialog-body');
  const cancelBtn = document.getElementById('app-dialog-cancel-btn');
  const confirmBtn = document.getElementById('app-dialog-confirm-btn');
  if (!modal || !body) return;

  if (eyebrow) eyebrow.textContent = 'Tài khoản cấp sẵn • Quy định & Bảo hành';
  if (title) title.textContent = 'Hướng dẫn đăng nhập 2FA & Chính sách bảo hành';
  body.innerHTML = buildPrebuiltGuideFullHtml(durationLabel);
  if (cancelBtn) cancelBtn.hidden = true;
  if (confirmBtn) {
    confirmBtn.textContent = 'Đã hiểu & Đóng';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.onclick = (e) => {
      e.preventDefault();
      modal.hidden = true;
      if (cancelBtn) cancelBtn.hidden = false;
      confirmBtn.onclick = null;
      if (document.getElementById('checkout-modal')?.hidden !== false) {
        document.body.style.overflow = '';
      }
    };
  }
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

const SALE_HIGHLIGHT_REGEX =
  /(\b\d+\s*(?:TB|GB)\b|Google\s+One|Google\s+AI\s+(?:Pro|Ultra)|Gemini(?:\s+Advanced|\s+Code\s+Assist|\s+CLI|\s+in\s+Chrome)?|Antigravity|Google\s+Flow|NotebookLM|Whisk|Veo\s*\d*|ChatGPT\s+Plus|Claude\s+Pro|1\s+đổi\s+1|24\/7|\b\d[\d.]*\s*tín\s*dụng\b)/gi;

export function renderSaleDescriptionHtml(rawDesc = '') {
  const clean = String(rawDesc || '').trim() || 'Tài khoản bản quyền chính hãng, bảo hành 1 đổi 1 trọn thời gian sử dụng.';
  const parts = clean
    .split(/\r?\n|(?:\.\s+)|(?:;\s+)|(?:•\s*)/)
    .map((s) => s.replace(/^[-\s*•✓✔]+/, '').replace(/\.$/, '').trim())
    .filter((s) => s.length >= 2);
  const lines = parts.length > 0 ? parts : [clean];
  return lines
    .map((line) => {
      const escaped = escapeHtml(line).replace(SALE_HIGHLIGHT_REGEX, '<strong class="sale-kw">$1</strong>');
      return `<li class="sale-desc-item"><span class="sale-desc-check" aria-hidden="true">✓</span><span>${escaped}</span></li>`;
    })
    .join('');
}
