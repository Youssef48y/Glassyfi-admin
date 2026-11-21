import { useEffect, useState } from 'react';
import { Upload, Loader2, X, Image as ImageIcon } from 'lucide-react';
import { supabase, WALLPAPERS_BUCKET } from '../lib/supabase';
import {
  formatFileSize,
  getExtensionFromFile,
  generateUniqueId,
} from '../lib/imageUtils';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25MB

export function LosslessImagePickerField({
  id = 'lossless-img',
  label = 'رابط الصورة أو اختيار من المعرض',
  hint = '(اختياري — يُرفع بالجودة الأصلية 100%)',
  value = '',
  onChange,
  notify,
  disabled = false,
  placeholder = 'https://...',
  maxBytes = DEFAULT_MAX_BYTES,
  onUploadingChange,
  showPreview = true,
  previewMaxHeight = 160,
}) {
  const [uploading, setUploading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [uploadedSize, setUploadedSize] = useState(null);

  useEffect(() => {
    setPreviewError(false);
  }, [value]);

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.type && !file.type.startsWith('image/')) {
        notify?.('يرجى اختيار ملف صورة صالح من المعرض', 'error');
        return;
      }
      if (file.size > maxBytes) {
        notify?.(
          `حجم الصورة يتجاوز الحد الأقصى المسموح (${formatFileSize(maxBytes)})`,
          'error',
        );
        return;
      }

      const ext = getExtensionFromFile(file);
      const contentType =
        file.type ||
        (ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg');

      setUploading(true);
      onUploadingChange?.(true);

      // Upload the 100% untouched original File object byte-for-byte (ZERO canvas compression/resizing)
      const storagePath = `media/${generateUniqueId()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(WALLPAPERS_BUCKET)
        .upload(storagePath, file, {
          contentType,
          cacheControl: '31536000',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'فشل رفع الصورة إلى التخزين السحابي');
      }

      const { data: urlData } = supabase.storage
        .from(WALLPAPERS_BUCKET)
        .getPublicUrl(storagePath);

      if (!urlData?.publicUrl) {
        throw new Error('تعذر استخراج الرابط العام للصورة المرفوعة');
      }

      onChange(urlData.publicUrl);
      setUploadedSize(file.size);
      setPreviewError(false);
      notify?.(
        `تم رفع الصورة الأصلية بدون ضغط (${formatFileSize(file.size)}) بنجاح 🖼️`,
        'success',
      );
    } catch (err) {
      notify?.(`تعذر رفع الصورة: ${err.message}`, 'error');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      e.target.value = '';
    }
  }

  const trimmed = String(value || '').trim();

  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ImageIcon size={14} />
          {label}
          {hint && <span className="field-hint">{hint}</span>}
        </label>

        <label
          className="btn btn-secondary btn-sm"
          style={{
            cursor: disabled || uploading ? 'wait' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={disabled || uploading}
            onChange={handleFileSelect}
          />
          {uploading ? (
            <>
              <Loader2 size={13} className="spinner" /> جاري الرفع...
            </>
          ) : (
            <>
              <Upload size={13} /> اختيار من المعرض
            </>
          )}
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          id={id}
          type="text"
          inputMode="url"
          className="input ltr"
          placeholder={placeholder}
          value={value}
          disabled={disabled || uploading}
          onChange={(e) => {
            setUploadedSize(null);
            onChange(e.target.value);
          }}
        />
        {trimmed && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            disabled={disabled || uploading}
            onClick={() => {
              setUploadedSize(null);
              onChange('');
            }}
            title="مسح رابط الصورة"
            aria-label="مسح رابط الصورة"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {uploadedSize && trimmed && (
        <span className="field-hint" style={{ color: 'var(--emerald)' }}>
          مرفوعة بالجودة الأصلية 100% ({formatFileSize(uploadedSize)})
        </span>
      )}

      {showPreview && trimmed && !previewError && (
        <img
          src={trimmed}
          alt="معاينة الصورة"
          className="push-preview-img"
          style={{ maxHeight: previewMaxHeight, marginTop: 6 }}
          onError={() => setPreviewError(true)}
        />
      )}
    </div>
  );
}
