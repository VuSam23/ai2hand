/**
 * js/services/imageUpload.js — Resize ảnh <= 256px & upload lên Supabase Storage (product-icons)
 */
import { SUPABASE_CONFIG, isSupabaseConfigured } from '../config/config.js';
import { readSession, isTokenExpiringSoon, refreshAccessToken } from './authRefresh.js';

export function resizeImageToBlob(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (blob) resolve(blob);
            else reject(new Error('Không thể nén tệp ảnh.'));
          },
          'image/webp',
          0.86
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Tệp ảnh không hợp lệ hoặc bị hỏng.'));
    };
    img.src = objectUrl;
  });
}

export async function uploadProductIcon(file, maxSize = 256, prefix = 'icon') {
  if (!isSupabaseConfigured()) {
    throw new Error('Tính năng tải ảnh lên Storage chỉ hoạt động khi kết nối Supabase.');
  }
  if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    throw new Error('Chỉ hỗ trợ ảnh định dạng PNG, JPG hoặc WebP.');
  }

  let session = readSession();
  if (!session?.isAdmin || !session?.accessToken) {
    throw new Error('Cần quyền Admin để tải ảnh lên kho.');
  }
  if (isTokenExpiringSoon(session)) {
    session = await refreshAccessToken();
  }

  const blob = await resizeImageToBlob(file, maxSize);
  const origin = SUPABASE_CONFIG.restUrl.replace(/\/rest\/v1\/?$/, '');
  const cleanPrefix = String(prefix || 'icon').replace(/[^a-z0-9_-]/gi, '') || 'icon';
  const fileName = `${cleanPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${origin}/storage/v1/object/product-icons/${fileName}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_CONFIG.publishableKey.trim(),
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': blob.type || 'image/webp',
        'x-upsert': 'true',
      },
      body: blob,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.message || `Lỗi upload Storage (${res.status})`);
    }
    return `${origin}/storage/v1/object/public/product-icons/${fileName}`;
  } finally {
    clearTimeout(timer);
  }
}
