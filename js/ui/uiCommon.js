/**
 * js/ui/uiCommon.js — Tiện ích UI dùng chung (Format, Escape XSS, Toast, Copy, Download .txt)
 */

export function formatVnd(amount) {
  return `${Number(amount || 0).toLocaleString('vi-VN')}₫`;
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

export function formatDateTime(isoString) {
  if (!isoString) return 'Vừa xong';
  try {
    return new Date(isoString).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function getInitials(fullName = '') {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'is-success' : type === 'error' ? 'is-error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

export async function copyText(text, label = 'Nội dung', btnEl = null) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Đã sao chép ${label}!`, 'success');

    if (btnEl && !btnEl.dataset.copyBusy) {
      const originalHtml = btnEl.innerHTML;
      btnEl.dataset.copyBusy = '1';
      btnEl.classList.add('is-copied');
      btnEl.innerHTML = `
        <svg class="icon" aria-hidden="true"><use href="#icon-check" /></svg>
        <span>Đã chép</span>
      `;
      setTimeout(() => {
        btnEl.innerHTML = originalHtml;
        btnEl.classList.remove('is-copied');
        delete btnEl.dataset.copyBusy;
      }, 1500);
    }
    return true;
  } catch {
    showToast('Trình duyệt không hỗ trợ sao chép tự động.', 'error');
    return false;
  }
}

export function downloadTextFile(filename, content) {
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`Đã tải xuống ${filename}!`, 'success');
  } catch {
    showToast('Không thể tạo tệp tải xuống.', 'error');
  }
}
