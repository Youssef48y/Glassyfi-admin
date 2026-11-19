import { SUPABASE_URL, WALLPAPERS_BUCKET } from './supabase';

export const MAX_WALLPAPER_BYTES = 25 * 1024 * 1024; // 25MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageFile(file) {
  if (!file) return 'لم يتم اختيار ملف';
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'الصيغة غير مدعومة. الصيغ المسموحة: JPG, PNG, WebP';
  }
  if (file.size > MAX_WALLPAPER_BYTES) {
    return 'حجم الملف يتجاوز الحد الأقصى المسموح (25 ميجابايت)';
  }
  return null;
}

export function getExtensionFromFile(file) {
  const nameExt = file.name?.split('.').pop()?.toLowerCase();
  if (nameExt && ['jpg', 'jpeg', 'png', 'webp'].includes(nameExt)) {
    return nameExt === 'jpeg' ? 'jpg' : nameExt;
  }
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Generates a lightweight WebP thumbnail via an offscreen canvas without touching
 * the original File object (so the full-res upload stays 100% lossless & untouched).
 */
export async function generateThumbnailBlob(file, maxDimension = 480, quality = 0.78) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('تعذر قراءة الصورة لتوليد المصغّرة'));
      image.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const targetW = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetH = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP; gracefully fall back to JPEG if browser lacks WebP encoder
    const webpBlob = await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/webp', quality),
    );
    if (webpBlob && webpBlob.type === 'image/webp') {
      return { blob: webpBlob, ext: 'webp', contentType: 'image/webp' };
    }

    const jpegBlob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('فشل توليد الصورة المصغّرة'))),
        'image/jpeg',
        0.82,
      ),
    );
    return { blob: jpegBlob, ext: 'jpg', contentType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Extracts the bucket-relative storage path from a Supabase public object URL.
 */
export function extractStoragePath(publicUrl) {
  if (!publicUrl || typeof publicUrl !== 'string') return null;
  const marker = `${SUPABASE_URL}/storage/v1/object/public/${WALLPAPERS_BUCKET}/`;
  if (!publicUrl.startsWith(marker)) return null;
  return decodeURIComponent(publicUrl.slice(marker.length).split('?')[0]);
}

export function deriveBadgeType({ is_pro, is_exclusive, is_new }) {
  if (is_pro) return 'pro';
  if (is_exclusive) return 'exclusive';
  if (is_new) return 'new';
  return 'none';
}

export function generateUniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
