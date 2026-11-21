import { useEffect, useMemo, useState } from 'react';
import {
  Rocket,
  Wrench,
  Save,
  ExternalLink,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Clock,
  Sparkles,
  LifeBuoy,
  FileText,
  HelpCircle,
  MessageCircle,
  Send,
  Instagram,
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
  DownloadCloud,
  Bell,
  Package,
  Image as ImageIcon,
  Upload,
  Pin,
  Link2,
} from 'lucide-react';
import { supabase, triggerSilentSync, WALLPAPERS_BUCKET } from '../lib/supabase';
import { formatDateAr } from '../lib/formatters';
import {
  formatFileSize,
  validateImageFile,
  getExtensionFromFile,
  generateUniqueId,
} from '../lib/imageUtils';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/Youssef48y/glassyfi-apk/releases?per_page=10';

function parseVersionCode(body) {
  const match = String(body || '').match(/Version Code:\s*(\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildDefaultApkFilename(versionName) {
  const ver = String(versionName || '1.0.0').trim().replace(/^v/i, '') || '1.0.0';
  return `Vitrify-v${ver}.apk`;
}

function buildDefaultTelegramCaption(versionName, changelogAr) {
  const ver = String(versionName || '1.0.0').trim().replace(/^v/i, '') || '1.0.0';
  const notes = String(changelogAr || '').trim();
  return [
    `<b>✨ تحديث Vitrify الجديد v${ver}</b>`,
    notes
      ? `\n<b>ما الجديد:</b>\n${notes}`
      : '\nثبّت ملف الـ APK المرفق للحصول على أحدث المزايا والتحسينات.',
  ].join('\n');
}

function buildPromoTemplateCaption() {
  return [
    '<b>🎁 هدية خاصة لمتابعي قناة Vitrify!</b>',
    '',
    'استخدم كود التفعيل التالي داخل التطبيق للحصول على باقة <b>Pro</b> مجاناً:',
    '<code>VITRIFY-GIFT30</code>',
    '',
    '⚡ سارع بالتفعيل قبل نفاد عدد الاستخدامات!',
  ].join('\n');
}

function buildNewWallpaperTemplateCaption() {
  return [
    '<b>🖼️ خلفية عمق جديدة متاحة الآن في Vitrify!</b>',
    '',
    'جرب الخلفية الجديدة بدقة أصلية كاملة مع تأثير العمق السحري والساعات الزجاجية ✨',
    'افتح قسم <b>الخلفيات</b> داخل التطبيق وحمّلها الآن.',
  ].join('\n');
}

const UPDATE_AUDIENCE_OPTIONS = [
  {
    value: 'all',
    label: 'الكل (إطلاق عام)',
    topics: ['all_users'],
    topicsLabel: 'all_users',
    toastTarget: 'جميع المستخدمين',
  },
  {
    value: 'lab',
    label: 'المختبر والمطورين (Beta)',
    topics: ['lab_users', 'dev_users'],
    topicsLabel: 'lab_users + dev_users',
    toastTarget: 'المختبر والمطورين (Beta)',
  },
  {
    value: 'dev',
    label: 'المطورين فقط (اختبار داخلي)',
    topics: ['dev_users'],
    topicsLabel: 'dev_users',
    toastTarget: 'المطورين فقط',
  },
];

const DEFAULT_CONFIG = {
  latest_version_code: 1,
  latest_version_name: '1.0.0',
  min_supported_version_code: 1,
  is_force_update: false,
  update_target_audience: 'all',
  update_url: '',
  update_changelog_ar: '',
  maintenance_mode: false,
  maintenance_message_ar: '',
  instagram_url: '',
  instagram_visible: true,
  whatsapp_url: '',
  whatsapp_visible: true,
  telegram_url: '',
  telegram_visible: true,
  telegram_channel_id: '@VitrifyApp',
  telegram_group_id: '@Vitrify_chat',
  terms_ar: 'مرحباً بك في Vitrify...',
  terms_updated_at: null,
  welcome_enabled: true,
  welcome_title_ar: 'مرحباً بك في Vitrify ✨',
  welcome_body_ar: 'استمتع بأجمل خلفيات العمق الحية والويدجيت الزجاجية المصممة خصيصاً لهاتفك.',
  welcome_image_url: '',
  welcome_cta_text: 'ابدأ الاستكشاف',
  config_revision: 1,
  updated_at: null,
};

const EMPTY_FAQ = {
  id: null,
  question_ar: '',
  answer_ar: '',
  sort_order: 10,
  is_visible: true,
};

export function ConfigTab({
  config,
  faqItems = [],
  wallpapers = [],
  loading,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('update'); // 'update' | 'content' | 'faq'
  const [form, setForm] = useState(DEFAULT_CONFIG);
  const [initialTerms, setInitialTerms] = useState('');
  const [saving, setSaving] = useState(false);

  // Smart GitHub Releases Fetch & Auto-Push on Save
  const [fetchingRelease, setFetchingRelease] = useState(false);
  const [fetchedReleaseInfo, setFetchedReleaseInfo] = useState(null);
  const [sendPushOnSave, setSendPushOnSave] = useState(false);

  // Telegram Publisher v3 state (APK / Text Post / Photo + Post)
  const [tgMode, setTgMode] = useState('apk'); // 'apk' | 'post' | 'photo'
  const [tgTarget, setTgTarget] = useState('channel'); // 'channel' | 'group' | 'both'
  const [tgApkFilename, setTgApkFilename] = useState('');
  const [tgFilenameTouched, setTgFilenameTouched] = useState(false);
  const [tgPhotoUrl, setTgPhotoUrl] = useState('');
  const [tgPhotoPreviewError, setTgPhotoPreviewError] = useState(false);
  const [tgUploadingPhoto, setTgUploadingPhoto] = useState(false);
  const [tgButtonText, setTgButtonText] = useState('');
  const [tgButtonUrl, setTgButtonUrl] = useState('');
  const [tgPinMessage, setTgPinMessage] = useState(false);
  const [tgCaption, setTgCaption] = useState(
    buildDefaultTelegramCaption('1.0.0', ''),
  );
  const [tgCaptionTouched, setTgCaptionTouched] = useState(false);
  const [publishingTelegram, setPublishingTelegram] = useState(false);

  // FAQ state
  const [faqForm, setFaqForm] = useState(EMPTY_FAQ);
  const [faqSaving, setFaqSaving] = useState(false);
  const [faqBusyId, setFaqBusyId] = useState('');
  const [deleteFaqTarget, setDeleteFaqTarget] = useState(null);
  const [deletingFaq, setDeletingFaq] = useState(false);

  const cloudWallpapers = useMemo(() => {
    if (!Array.isArray(wallpapers)) return [];
    return wallpapers.filter(
      (w) =>
        w &&
        typeof w.image_url === 'string' &&
        /^https?:\/\//i.test(w.image_url.trim()),
    );
  }, [wallpapers]);

  useEffect(() => {
    if (config) {
      const termsVal = config.terms_ar ?? 'مرحباً بك في Vitrify...';
      const vName = config.latest_version_name ?? '1.0.0';
      const vLog = config.update_changelog_ar ?? '';
      setInitialTerms(termsVal);
      setForm({
        latest_version_code: config.latest_version_code ?? 1,
        latest_version_name: vName,
        min_supported_version_code: config.min_supported_version_code ?? 1,
        is_force_update: Boolean(config.is_force_update),
        update_target_audience: ['all', 'lab', 'dev'].includes(
          config.update_target_audience,
        )
          ? config.update_target_audience
          : 'all',
        update_url: config.update_url ?? '',
        update_changelog_ar: vLog,
        maintenance_mode: Boolean(config.maintenance_mode),
        maintenance_message_ar: config.maintenance_message_ar ?? '',
        instagram_url: config.instagram_url ?? '',
        instagram_visible: config.instagram_visible ?? true,
        whatsapp_url: config.whatsapp_url ?? '',
        whatsapp_visible: config.whatsapp_visible ?? true,
        telegram_url: config.telegram_url ?? '',
        telegram_visible: config.telegram_visible ?? true,
        telegram_channel_id: config.telegram_channel_id || '@VitrifyApp',
        telegram_group_id: config.telegram_group_id || '@Vitrify_chat',
        terms_ar: termsVal,
        terms_updated_at: config.terms_updated_at ?? null,
        welcome_enabled: config.welcome_enabled ?? true,
        welcome_title_ar: config.welcome_title_ar ?? 'مرحباً بك في Vitrify ✨',
        welcome_body_ar:
          config.welcome_body_ar ??
          'استمتع بأجمل خلفيات العمق الحية والويدجيت الزجاجية المصممة خصيصاً لهاتفك.',
        welcome_image_url: config.welcome_image_url ?? '',
        welcome_cta_text: config.welcome_cta_text ?? 'ابدأ الاستكشاف',
        config_revision: config.config_revision ?? 1,
        updated_at: config.updated_at ?? null,
      });
    }
  }, [config]);

  // Auto-sync Telegram caption with version unless manually edited
  useEffect(() => {
    if (!tgCaptionTouched) {
      setTgCaption(
        buildDefaultTelegramCaption(
          form.latest_version_name,
          form.update_changelog_ar,
        ),
      );
    }
  }, [form.latest_version_name, form.update_changelog_ar, tgCaptionTouched]);

  // Pre-fill default APK filename (WITHOUT -release) only if untouched by user
  useEffect(() => {
    if (!tgFilenameTouched) {
      setTgApkFilename(buildDefaultApkFilename(form.latest_version_name));
    }
  }, [form.latest_version_name, tgFilenameTouched]);

  useEffect(() => {
    setTgPhotoPreviewError(false);
  }, [tgPhotoUrl]);

  async function handleFetchLatestGithubRelease() {
    setFetchingRelease(true);
    try {
      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });

      if (res.status === 404) {
        notify('لا يوجد إصدار منشور (Release) على GitHub حتى الآن', 'error');
        return;
      }
      if (!res.ok) {
        throw new Error(`GitHub API HTTP ${res.status}`);
      }

      const releases = await res.json();
      if (!Array.isArray(releases) || releases.length === 0) {
        notify('لا يوجد إصدار منشور (Release) على GitHub حتى الآن', 'error');
        return;
      }

      const latest = releases[0];
      const previous = releases[1] || null;

      const rawTag = String(latest.tag_name || '').trim();
      const cleanedVersion = rawTag.replace(/^v/i, '').trim() || form.latest_version_name || '1.0.0';

      const parsedLatestCode = parseVersionCode(latest.body);
      const newLatestCode =
        parsedLatestCode ??
        Math.max(Number(form.latest_version_code || 0) + 1, releases.length + 1);

      const minSupportedCode = previous
        ? (parseVersionCode(previous.body) ?? Math.max(1, newLatestCode - 1))
        : 1;

      const assets = Array.isArray(latest.assets) ? latest.assets : [];
      const apkAsset = assets.find((a) =>
        String(a?.name || '').toLowerCase().endsWith('.apk'),
      );

      const summaryLine = `تم الجلب: الإصدار الحالي v${cleanedVersion} (كود ${newLatestCode}) — الإصدار السابق (كود ${minSupportedCode})`;

      if (!apkAsset?.browser_download_url) {
        setForm((p) => ({
          ...p,
          latest_version_name: cleanedVersion,
          latest_version_code: newLatestCode,
          min_supported_version_code: minSupportedCode,
        }));
        setFetchedReleaseInfo({
          summaryLine,
          name: null,
          size: null,
        });
        notify(
          `${summaryLine} — لكن لا يوجد ملف .apk مرفق بهذا الإصدار`,
          'error',
        );
        return;
      }

      const sizeText = formatFileSize(apkAsset.size);
      setForm((p) => ({
        ...p,
        update_url: apkAsset.browser_download_url,
        latest_version_name: cleanedVersion,
        latest_version_code: newLatestCode,
        min_supported_version_code: minSupportedCode,
      }));
      setFetchedReleaseInfo({
        summaryLine,
        name: apkAsset.name,
        size: sizeText,
      });

      notify(summaryLine, 'success');
    } catch (err) {
      notify(`تعذر جلب آخر إصدار من GitHub: ${err.message}`, 'error');
    } finally {
      setFetchingRelease(false);
    }
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const cleanTerms = form.terms_ar.trim();
      const termsChanged = cleanTerms !== (initialTerms || '').trim();

      const safeUpdateAudience = ['all', 'lab', 'dev'].includes(
        form.update_target_audience,
      )
        ? form.update_target_audience
        : 'all';

      const payload = {
        id: 1,
        latest_version_code: Math.max(1, Number(form.latest_version_code) || 1),
        latest_version_name: form.latest_version_name.trim() || '1.0.0',
        min_supported_version_code: Math.max(
          1,
          Number(form.min_supported_version_code) || 1,
        ),
        is_force_update: Boolean(form.is_force_update),
        update_target_audience: safeUpdateAudience,
        update_url: form.update_url.trim(),
        update_changelog_ar: form.update_changelog_ar.trim(),
        maintenance_mode: Boolean(form.maintenance_mode),
        maintenance_message_ar: form.maintenance_message_ar.trim(),
        instagram_url: form.instagram_url.trim(),
        instagram_visible: Boolean(form.instagram_visible),
        whatsapp_url: form.whatsapp_url.trim(),
        whatsapp_visible: Boolean(form.whatsapp_visible),
        telegram_url: form.telegram_url.trim(),
        telegram_visible: Boolean(form.telegram_visible),
        telegram_channel_id: form.telegram_channel_id.trim() || '@VitrifyApp',
        telegram_group_id: form.telegram_group_id.trim() || '@Vitrify_chat',
        terms_ar: cleanTerms,
        ...(termsChanged ? { terms_updated_at: new Date().toISOString() } : {}),
        welcome_enabled: Boolean(form.welcome_enabled),
        welcome_title_ar: form.welcome_title_ar.trim(),
        welcome_body_ar: form.welcome_body_ar.trim(),
        welcome_image_url: form.welcome_image_url.trim(),
        welcome_cta_text: form.welcome_cta_text.trim() || 'ابدأ الاستكشاف',
      };

      const { error } = await supabase
        .from('app_config')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      if (subTab === 'update' && sendPushOnSave) {
        const audienceMeta =
          UPDATE_AUDIENCE_OPTIONS.find((opt) => opt.value === safeUpdateAudience) ||
          UPDATE_AUDIENCE_OPTIONS[0];
        const pushTitle = `تحديث جديد لـ Vitrify ${payload.latest_version_name} متاح الآن ✨`;
        const pushBody =
          payload.update_changelog_ar ||
          'اضغط لتنزيل وتثبيت التحديث الجديد مباشرة.';

        const pushResults = await Promise.all(
          audienceMeta.topics.map(async (topic) => {
            const { data: pushRes, error: pushErr } =
              await supabase.functions.invoke('send-push', {
                body: {
                  topic,
                  title: pushTitle,
                  body: pushBody,
                  deep_link: 'vitrify://updates',
                  also_silent_sync: true,
                },
              });
            return {
              topic,
              ok: !pushErr && Boolean(pushRes?.ok),
              error:
                pushErr?.message ||
                pushRes?.details ||
                pushRes?.error ||
                null,
            };
          }),
        );

        const failedPushes = pushResults.filter((r) => !r.ok);
        if (failedPushes.length > 0) {
          await Promise.all(
            failedPushes.map((f) => triggerSilentSync({ topic: f.topic })),
          );
          notify(
            `تم حفظ الإعدادات لكن تعذر إرسال إشعار التحديث إلى (${failedPushes.map((f) => f.topic).join(' ، ')}): ${failedPushes.map((f) => f.error || 'خطأ غير معروف').join(' | ')}`,
            'error',
          );
        } else {
          setSendPushOnSave(false);
          notify(
            `تم حفظ الإعدادات وإرسال إشعار التحديث (${payload.latest_version_name}) إلى ${audienceMeta.toastTarget} (${audienceMeta.topicsLabel}) ✨`,
            'success',
          );
        }
      } else {
        triggerSilentSync({ topic: 'all_users' });
        notify('تم حفظ الإعدادات وإرسال نبضة التحديث الفوري لجميع التطبيقات', 'success');
      }

      await onRefresh();
    } catch (err) {
      notify(`تعذر حفظ الإعدادات: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function applyTelegramTemplate(templateKey) {
    setTgCaptionTouched(true);
    if (templateKey === 'update') {
      setTgCaption(
        buildDefaultTelegramCaption(
          form.latest_version_name,
          form.update_changelog_ar,
        ),
      );
      return;
    }
    if (templateKey === 'promo') {
      setTgCaption(buildPromoTemplateCaption());
      return;
    }
    if (templateKey === 'wallpaper') {
      setTgCaption(buildNewWallpaperTemplateCaption());
    }
  }

  async function handleUploadTelegramPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const normalizedType =
        file.type === 'image/jpg' ? 'image/jpeg' : file.type;
      const ext = getExtensionFromFile(file);
      const isAllowedByExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

      if (normalizedType) {
        const validationErr = validateImageFile(
          normalizedType === file.type
            ? file
            : { type: normalizedType, size: file.size, name: file.name },
        );
        if (validationErr) {
          notify(validationErr, 'error');
          return;
        }
      } else if (!isAllowedByExt) {
        notify('الصيغة غير مدعومة. الصيغ المسموحة: JPG, PNG, WebP', 'error');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        notify('حجم الصورة يتجاوز حد تيليجرام المباشر للصور (10 ميجابايت)', 'error');
        return;
      }

      const contentType =
        normalizedType ||
        (ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg');

      setTgUploadingPhoto(true);
      const storagePath = `telegram-uploads/${generateUniqueId()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(WALLPAPERS_BUCKET)
        .upload(storagePath, file, {
          contentType,
          cacheControl: '3600',
          upsert: true,
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

      setTgPhotoUrl(urlData.publicUrl);
      setTgPhotoPreviewError(false);
      notify('تم رفع الصورة بنجاح وأصبحت جاهزة للنشر على تيليجرام 🖼️', 'success');
    } catch (err) {
      notify(`تعذر رفع الصورة: ${err.message}`, 'error');
    } finally {
      setTgUploadingPhoto(false);
      e.target.value = '';
    }
  }

  async function handlePublishTelegram() {
    const channelId = form.telegram_channel_id.trim() || '@VitrifyApp';
    const groupId = form.telegram_group_id.trim() || '@Vitrify_chat';
    const caption = tgCaption.trim();
    const buttonText = tgButtonText.trim();
    const buttonUrl = tgButtonUrl.trim();

    if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) {
      notify('يرجى إدخال نص الزر والرابط معاً أو تركهما فارغين', 'error');
      return;
    }
    if (buttonUrl && !/^(https?|tg):\/\/.+/i.test(buttonUrl)) {
      notify('رابط الزر يجب أن يبدأ بـ https:// أو http:// أو tg://', 'error');
      return;
    }

    const basePayload = {
      mode: tgMode,
      target: tgTarget,
      caption,
      pin_message: Boolean(tgPinMessage),
      channel_id: channelId,
      group_id: groupId,
      ...(buttonText && buttonUrl
        ? { button_text: buttonText, button_url: buttonUrl }
        : {}),
    };

    let requestBody;
    let effectiveApkFilename = '';

    switch (tgMode) {
      case 'post': {
        if (!caption) {
          notify('يرجى كتابة نص المنشور أولاً', 'error');
          return;
        }
        // Strictly text-only post: NEVER include apk_url, apk_filename, or photo_url
        requestBody = { ...basePayload, mode: 'post' };
        break;
      }

      case 'photo': {
        const photoUrl = tgPhotoUrl.trim();
        if (!photoUrl || !/^https?:\/\/.+/i.test(photoUrl)) {
          notify('يرجى لصق رابط صورة صالح أو رفع صورة من الجهاز أولاً', 'error');
          return;
        }
        // Strictly photo + caption: NEVER include apk_url or apk_filename
        requestBody = {
          ...basePayload,
          mode: 'photo',
          photo_url: photoUrl,
        };
        break;
      }

      case 'apk': {
        const apkUrl = form.update_url.trim();
        if (!apkUrl || !/^https?:\/\/.+/i.test(apkUrl)) {
          notify(
            'يرجى إدخال أو جلب رابط تحميل الـ APK المباشر (update_url) أولاً',
            'error',
          );
          return;
        }
        const versionName = form.latest_version_name.trim() || '1.0.0';
        effectiveApkFilename =
          tgApkFilename.trim() || buildDefaultApkFilename(versionName);
        requestBody = {
          ...basePayload,
          mode: 'apk',
          apk_url: apkUrl,
          version_name: versionName,
          apk_filename: effectiveApkFilename,
        };
        break;
      }

      default:
        notify('وضع النشر غير معروف', 'error');
        return;
    }

    setPublishingTelegram(true);
    try {
      // Persist channel_id & group_id to app_config so they stay saved
      await supabase
        .from('app_config')
        .update({
          telegram_channel_id: channelId,
          telegram_group_id: groupId,
        })
        .eq('id', 1);

      const { data, error } = await supabase.functions.invoke('publish-telegram', {
        body: requestBody,
      });

      if (error) {
        let serverError = error.message || 'تعذر استدعاء دالة النشر على تيليجرام';
        if (error.context && typeof error.context.json === 'function') {
          const errJson = await error.context.json().catch(() => null);
          if (errJson?.error) serverError = errJson.error;
        }
        throw new Error(serverError);
      }
      if (!data?.ok) {
        throw new Error(data?.error || 'فشل النشر على تيليجرام');
      }

      const sentResults = Array.isArray(data.results)
        ? data.results.filter((r) => r.ok)
        : [];
      const sentTargets = sentResults.map((r) => r.chat_id);
      const failedTargets = Array.isArray(data.results)
        ? data.results.filter((r) => !r.ok)
        : [];
      const pinWarnings = sentResults
        .filter((r) => r.pin_error)
        .map((r) => `${r.chat_id}: ${r.pin_error}`);

      if (failedTargets.length > 0) {
        notify(
          `تم الإرسال إلى (${sentTargets.join(' ، ')}) وتعذر الإرسال إلى: ${failedTargets.map((f) => `${f.chat_id} (${f.error})`).join(' | ')}`,
          'error',
        );
      } else {
        const pinNote = pinWarnings.length > 0 ? ` (تنبيه التثبيت: ${pinWarnings.join(' | ')})` : '';
        if (tgMode === 'apk') {
          notify(
            `تم رفع وإرسال ${data.fileName || effectiveApkFilename} إلى تيليجرام بنجاح (${sentTargets.join(' ، ')}) ✈️${pinNote}`,
            'success',
          );
        } else if (tgMode === 'photo') {
          notify(
            `تم نشر الصورة والمنشور على تيليجرام بنجاح (${sentTargets.join(' ، ')}) 🖼️✈️${pinNote}`,
            'success',
          );
        } else {
          notify(
            `تم نشر المنشور النصي على تيليجرام بنجاح (${sentTargets.join(' ، ')}) ✈️${pinNote}`,
            'success',
          );
        }
      }
    } catch (err) {
      notify(`خطأ في النشر على تيليجرام: ${err.message}`, 'error');
    } finally {
      setPublishingTelegram(false);
    }
  }

  async function handleSaveFaq(e) {
    e.preventDefault();
    const q = faqForm.question_ar.trim();
    const a = faqForm.answer_ar.trim();
    if (!q || !a) {
      notify('يرجى إدخال السؤال والإجابة بالعربية', 'error');
      return;
    }

    setFaqSaving(true);
    try {
      const payload = {
        question_ar: q,
        answer_ar: a,
        sort_order: Number(faqForm.sort_order) || 0,
        is_visible: Boolean(faqForm.is_visible),
      };

      const { error } = faqForm.id
        ? await supabase.from('faq_items').update(payload).eq('id', faqForm.id)
        : await supabase.from('faq_items').insert(payload);

      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify(faqForm.id ? 'تم تحديث السؤال بنجاح' : 'تمت إضافة السؤال بنجاح', 'success');
      setFaqForm({ ...EMPTY_FAQ, sort_order: faqItems.length + 1 });
      await onRefresh();
    } catch (err) {
      notify(`تعذر حفظ السؤال: ${err.message}`, 'error');
    } finally {
      setFaqSaving(false);
    }
  }

  async function handleToggleFaqVisible(item) {
    setFaqBusyId(item.id);
    try {
      const { error } = await supabase
        .from('faq_items')
        .update({ is_visible: !item.is_visible })
        .eq('id', item.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`فشل التحديث: ${err.message}`, 'error');
    } finally {
      setFaqBusyId('');
    }
  }

  async function handleReorderFaq(index, direction) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= faqItems.length) return;
    const current = faqItems[index];
    const target = faqItems[swapIndex];

    setFaqBusyId(current.id);
    try {
      const currentOrder = current.sort_order === target.sort_order ? index : current.sort_order;
      const targetOrder = current.sort_order === target.sort_order ? swapIndex : target.sort_order;

      await Promise.all([
        supabase.from('faq_items').update({ sort_order: targetOrder }).eq('id', current.id),
        supabase.from('faq_items').update({ sort_order: currentOrder }).eq('id', target.id),
      ]);
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`تعذر إعادة الترتيب: ${err.message}`, 'error');
    } finally {
      setFaqBusyId('');
    }
  }

  async function confirmDeleteFaq() {
    if (!deleteFaqTarget) return;
    setDeletingFaq(true);
    try {
      const { error } = await supabase
        .from('faq_items')
        .delete()
        .eq('id', deleteFaqTarget.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify('تم حذف السؤال بنجاح', 'success');
      if (faqForm.id === deleteFaqTarget.id) setFaqForm(EMPTY_FAQ);
      setDeleteFaqTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setDeletingFaq(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الإعدادات، التحديث والدعم</h1>
          <p>التحديث التلقائي، الصيانة، روابط الدعم، الرسالة الترحيبية، الشروط والأحكام، والأسئلة الشائعة</p>
        </div>

        <div className="header-actions">
          <span className="badge badge-white" style={{ padding: '6px 12px' }}>
            <Sparkles size={13} />
            Revision <span className="mono">#{form.config_revision}</span>
          </span>
          {form.updated_at && (
            <span className="badge badge-neutral" style={{ padding: '6px 12px' }}>
              <Clock size={13} />
              آخر تحديث: {formatDateAr(form.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Sub-navigation */}
      <div style={{ marginBottom: 18 }}>
        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${subTab === 'update' ? ' active' : ''}`}
            onClick={() => setSubTab('update')}
          >
            <Rocket size={15} />
            التحديث والصيانة
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'content' ? ' active' : ''}`}
            onClick={() => setSubTab('content')}
          >
            <LifeBuoy size={15} />
            الدعم والترحيب والشروط
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'faq' ? ' active' : ''}`}
            onClick={() => setSubTab('faq')}
          >
            <HelpCircle size={15} />
            الأسئلة الشائعة ({faqItems.length})
          </button>
        </div>
      </div>

      {loading && !config ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" />
          <span>جاري تحميل إعدادات التطبيق...</span>
        </div>
      ) : subTab === 'update' ? (
        <form onSubmit={handleSaveConfig}>
          <div className="glass-panel section-card">
            <div className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Rocket size={18} />
                إعدادات التحديث التلقائي
              </span>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {form.is_force_update && (
                  <span className="badge badge-rose">تحديث إجباري مفعّل</span>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={fetchingRelease}
                  onClick={handleFetchLatestGithubRelease}
                >
                  {fetchingRelease ? (
                    <>
                      <Loader2 size={14} className="spinner" />
                      جاري الجلب من GitHub...
                    </>
                  ) : (
                    <>
                      <DownloadCloud size={14} />
                      جلب آخر إصدار من GitHub
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="form-grid cols-3" style={{ marginBottom: fetchedReleaseInfo ? 10 : 15 }}>
              <div className="field">
                <label className="field-label" htmlFor="cfg-vcode">
                  أحدث رقم إصدار (Version Code)
                </label>
                <input
                  id="cfg-vcode"
                  type="number"
                  min={1}
                  className="input mono"
                  value={form.latest_version_code}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, latest_version_code: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="cfg-vname">
                  اسم الإصدار (Version Name)
                </label>
                <input
                  id="cfg-vname"
                  className="input mono"
                  placeholder="1.0.0"
                  value={form.latest_version_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, latest_version_name: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="cfg-min-vcode">
                  أقل إصدار مدعوم (Min Code)
                </label>
                <input
                  id="cfg-min-vcode"
                  type="number"
                  min={1}
                  className="input mono"
                  value={form.min_supported_version_code}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      min_supported_version_code: e.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            {fetchedReleaseInfo && (
              <div className="alert-banner alert-emerald" style={{ marginBottom: 15 }}>
                <DownloadCloud size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{fetchedReleaseInfo.summaryLine}</div>
                  {fetchedReleaseInfo.name && (
                    <div style={{ fontSize: '0.76rem', opacity: 0.9, marginTop: 2 }}>
                      الملف: <strong className="mono">{fetchedReleaseInfo.name}</strong> • الحجم:{' '}
                      <strong className="mono">{fetchedReleaseInfo.size}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="field" style={{ marginBottom: 15 }}>
              <label className="field-label" htmlFor="cfg-url">
                رابط تحميل التحديث المباشر (Direct APK / Store Link)
                {form.update_url.trim() && (
                  <a
                    href={form.update_url.trim()}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.75rem',
                    }}
                  >
                    تجربة الرابط <ExternalLink size={12} />
                  </a>
                )}
              </label>
              <input
                id="cfg-url"
                type="url"
                className="input ltr"
                placeholder="https://github.com/.../releases/download/v1.0.0/Vitrify.apk"
                value={form.update_url}
                onChange={(e) => setForm((p) => ({ ...p, update_url: e.target.value }))}
              />
            </div>

            <div className="field" style={{ marginBottom: 15 }}>
              <label className="field-label" htmlFor="cfg-changelog">
                ما الجديد في التحديث (بالعربية)
              </label>
              <textarea
                id="cfg-changelog"
                className="textarea"
                placeholder="• تحسين سلاسة خلفيات العمق&#10;• إضافة 40 ويدجيت وأدوات استوديو العمق"
                value={form.update_changelog_ar}
                onChange={(e) =>
                  setForm((p) => ({ ...p, update_changelog_ar: e.target.value }))
                }
              />
            </div>

            <div className="field" style={{ marginBottom: 15 }}>
              <span className="field-label">
                الجمهور المستهدف للتحديث (Update Target Audience)
                <span className="badge badge-neutral mono">
                  {(
                    UPDATE_AUDIENCE_OPTIONS.find(
                      (o) => o.value === form.update_target_audience,
                    ) || UPDATE_AUDIENCE_OPTIONS[0]
                  ).topicsLabel}
                </span>
              </span>
              <div className="filter-strip" style={{ marginBottom: 0 }}>
                {UPDATE_AUDIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`chip${form.update_target_audience === opt.value ? ' active' : ''}`}
                    onClick={() =>
                      setForm((p) => ({ ...p, update_target_audience: opt.value }))
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="switch-row">
                <div className="switch-meta">
                  <span className="switch-title">
                    <ShieldAlert size={16} color="var(--rose)" />
                    تحديث إجباري (Force Update)
                  </span>
                  <span className="switch-desc">
                    يمنع المستخدم من تجاوز نافذة التحديث قبل تنزيل الإصدار الجديد
                  </span>
                </div>
                <ToggleSwitch
                  checked={form.is_force_update}
                  tone="rose"
                  onChange={(v) => setForm((p) => ({ ...p, is_force_update: v }))}
                  ariaLabel="تفعيل التحديث الإجباري"
                />
              </div>

              <div className="switch-row">
                <div className="switch-meta">
                  <span className="switch-title">
                    <Bell size={16} color={sendPushOnSave ? 'var(--emerald)' : 'var(--text-secondary)'} />
                    إرسال إشعار فوري بالتحديث عند الحفظ
                  </span>
                  <span className="switch-desc">
                    يرسل إشعار FCM تلقائياً لـ{' '}
                    <span className="mono">
                      {(
                        UPDATE_AUDIENCE_OPTIONS.find(
                          (o) => o.value === form.update_target_audience,
                        ) || UPDATE_AUDIENCE_OPTIONS[0]
                      ).topicsLabel}
                    </span>{' '}
                    فقط مع توجيه مباشر إلى{' '}
                    <span className="mono">vitrify://updates</span>
                  </span>
                </div>
                <ToggleSwitch
                  checked={sendPushOnSave}
                  tone="emerald"
                  onChange={setSendPushOnSave}
                  ariaLabel="إرسال إشعار فوري بالتحديث عند الحفظ"
                />
              </div>
            </div>
          </div>

          {/* Telegram Publisher Card (APK / Text Post / Photo + Post) */}
          <div className="glass-panel section-card">
            <div className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Send size={18} color="var(--sky)" />
                النشر على تيليجرام (Telegram Publisher)
              </span>

              <div className="segmented">
                {[
                  { id: 'apk', label: 'إرسال APK', icon: Package },
                  { id: 'post', label: 'منشور نصي', icon: FileText },
                  { id: 'photo', label: 'صورة + منشور', icon: ImageIcon },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`segmented-btn${tgMode === m.id ? ' active' : ''}`}
                      onClick={() => setTgMode(m.id)}
                    >
                      <Icon size={14} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="cfg-tg-channel">
                  معرّف القناة (Channel ID)
                </label>
                <input
                  id="cfg-tg-channel"
                  className="input mono"
                  placeholder="@VitrifyApp"
                  value={form.telegram_channel_id}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, telegram_channel_id: e.target.value }))
                  }
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="cfg-tg-group">
                  معرّف الجروب (Group ID)
                </label>
                <input
                  id="cfg-tg-group"
                  className="input mono"
                  placeholder="@Vitrify_chat"
                  value={form.telegram_group_id}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, telegram_group_id: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <span className="field-label">وجهة النشر على تيليجرام</span>
              <div className="segmented">
                {[
                  { id: 'channel', label: 'القناة فقط' },
                  { id: 'group', label: 'الجروب فقط' },
                  { id: 'both', label: 'الاثنين معاً' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`segmented-btn${tgTarget === opt.id ? ' active' : ''}`}
                    onClick={() => setTgTarget(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* APK Filename Input (APK Mode) */}
            {tgMode === 'apk' && (
              <div className="field" style={{ marginBottom: 14 }}>
                <div className="field-label">
                  <label htmlFor="cfg-tg-apk-name">
                    اسم ملف التطبيق (apk_filename)
                  </label>
                  <span className="field-hint">يُرسل بالاسم الدقيق ويُضاف .apk تلقائياً إذا لم يُكتب</span>
                </div>
                <input
                  id="cfg-tg-apk-name"
                  className="input mono"
                  placeholder={buildDefaultApkFilename(form.latest_version_name)}
                  value={tgApkFilename}
                  onChange={(e) => {
                    setTgFilenameTouched(true);
                    setTgApkFilename(e.target.value);
                  }}
                />
              </div>
            )}

            {/* Photo URL / Upload / Existing Wallpaper Picker (Photo + Post Mode) */}
            {tgMode === 'photo' && (
              <div className="glass-subcard" style={{ padding: 14, marginBottom: 14 }}>
                <div className="field" style={{ marginBottom: 10 }}>
                  <div className="field-label">
                    <label htmlFor="cfg-tg-photo-url">رابط الصورة أو رفع صورة من الجهاز</label>
                    <label
                      className="btn btn-secondary btn-sm"
                      style={{ cursor: tgUploadingPhoto ? 'wait' : 'pointer' }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        disabled={tgUploadingPhoto}
                        onChange={handleUploadTelegramPhoto}
                      />
                      {tgUploadingPhoto ? (
                        <>
                          <Loader2 size={13} className="spinner" /> جاري الرفع...
                        </>
                      ) : (
                        <>
                          <Upload size={13} /> رفع صورة من الجهاز
                        </>
                      )}
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      id="cfg-tg-photo-url"
                      type="text"
                      inputMode="url"
                      className="input ltr"
                      placeholder="https://example.com/photo.jpg"
                      value={tgPhotoUrl}
                      onChange={(e) => setTgPhotoUrl(e.target.value)}
                    />
                    {tgPhotoUrl.trim() && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={() => setTgPhotoUrl('')}
                        title="مسح رابط الصورة"
                        aria-label="مسح رابط الصورة"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {cloudWallpapers.length > 0 && (
                  <div className="field" style={{ marginBottom: tgPhotoUrl.trim() ? 10 : 0 }}>
                    <label className="field-label" htmlFor="cfg-tg-wp-pick">
                      أو اختر من خلفيات التطبيق الحالية
                    </label>
                    <select
                      id="cfg-tg-wp-pick"
                      className="select"
                      value={
                        cloudWallpapers.some((w) => w.image_url === tgPhotoUrl)
                          ? tgPhotoUrl
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) setTgPhotoUrl(e.target.value);
                      }}
                    >
                      <option value="">— اختر خلفية سحابية —</option>
                      {cloudWallpapers.map((w) => (
                        <option key={w.id} value={w.image_url}>
                          {w.title_ar || w.title_en || 'خلفية'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {tgPhotoUrl.trim() && !tgPhotoPreviewError && (
                  <img
                    src={tgPhotoUrl.trim()}
                    alt="معاينة صورة المنشور"
                    className="push-preview-img"
                    style={{ maxHeight: 170 }}
                    onError={() => setTgPhotoPreviewError(true)}
                  />
                )}
              </div>
            )}

            {/* Quick Post Templates Chips */}
            <div className="field" style={{ marginBottom: 10 }}>
              <span className="field-label">قوالب منشورات جاهزة</span>
              <div className="filter-strip" style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => applyTelegramTemplate('update')}
                >
                  <Sparkles size={12} /> قالب تحديث جديد
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => applyTelegramTemplate('promo')}
                >
                  <Sparkles size={12} /> قالب كود برومو هدية
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => applyTelegramTemplate('wallpaper')}
                >
                  <ImageIcon size={12} /> قالب خلفية جديدة
                </button>
              </div>
            </div>

            {/* Editable HTML Caption Box */}
            <div className="field" style={{ marginBottom: 14 }}>
              <div className="field-label">
                <label htmlFor="cfg-tg-caption">
                  {tgMode === 'post' ? 'نص المنشور *' : 'نص المنشور (Caption)'}
                </label>
                <span className="field-hint">
                  يدعم HTML: <code className="mono">&lt;b&gt;عريض&lt;/b&gt;</code> •{' '}
                  <code className="mono">&lt;code&gt;كود&lt;/code&gt;</code>
                </span>
              </div>
              <textarea
                id="cfg-tg-caption"
                className="textarea"
                style={{ minHeight: 112 }}
                value={tgCaption}
                onChange={(e) => {
                  setTgCaptionTouched(true);
                  setTgCaption(e.target.value);
                }}
              />
            </div>

            {/* Optional Inline Button (reply_markup.inline_keyboard) */}
            <div className="glass-subcard" style={{ padding: 13, marginBottom: 14 }}>
              <div className="field-label" style={{ marginBottom: 9 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Link2 size={14} />
                  زر أسفل المنشور (اختياري)
                </span>
              </div>
              <div className="form-grid cols-2">
                <div className="field">
                  <label className="field-label" htmlFor="cfg-tg-btn-text">
                    نص الزر
                  </label>
                  <input
                    id="cfg-tg-btn-text"
                    className="input"
                    placeholder="مثال: تحميل أحدث إصدار ⬇️"
                    value={tgButtonText}
                    onChange={(e) => setTgButtonText(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="cfg-tg-btn-url">
                    الرابط
                  </label>
                  <input
                    id="cfg-tg-btn-url"
                    type="text"
                    inputMode="url"
                    className="input ltr"
                    placeholder="https://t.me/VitrifyApp"
                    value={tgButtonUrl}
                    onChange={(e) => setTgButtonUrl(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Pin Message Toggle */}
            <div className="switch-row" style={{ marginBottom: 16 }}>
              <div className="switch-meta">
                <span className="switch-title">
                  <Pin size={15} color={tgPinMessage ? 'var(--amber)' : 'var(--text-secondary)'} />
                  تثبيت المنشور تلقائياً في القناة (Pin)
                </span>
                <span className="switch-desc">
                  يستدعي <span className="mono">pinChatMessage</span> تلقائياً على الرسالة فور نشرها
                </span>
              </div>
              <ToggleSwitch
                checked={tgPinMessage}
                tone="amber"
                onChange={setTgPinMessage}
                ariaLabel="تثبيت المنشور تلقائياً في القناة"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  publishingTelegram ||
                  tgUploadingPhoto ||
                  (tgMode === 'apk' && !form.update_url.trim()) ||
                  (tgMode === 'photo' && !tgPhotoUrl.trim()) ||
                  (tgMode === 'post' && !tgCaption.trim())
                }
                onClick={handlePublishTelegram}
              >
                {publishingTelegram ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    {tgMode === 'apk'
                      ? 'جاري سحب الـ APK ورفعه إلى تيليجرام...'
                      : 'جاري النشر على تيليجرام...'}
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    {tgMode === 'apk'
                      ? 'إرسال الـ APK إلى تيليجرام الآن ✈️'
                      : tgMode === 'photo'
                        ? 'نشر الصورة والمنشور على تيليجرام ✈️'
                        : 'نشر المنشور النصي على تيليجرام ✈️'}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Wrench size={18} color="var(--amber)" />
                وضع الصيانة (Maintenance Mode)
              </span>
              {form.maintenance_mode && (
                <span className="badge badge-rose">التطبيق في وضع الصيانة</span>
              )}
            </h2>

            {form.maintenance_mode && (
              <div className="alert-banner alert-amber" style={{ marginBottom: 14 }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  تنبيه: عند الحفظ مع تفعيل وضع الصيانة، سيتوقف التطبيق فوراً لدى جميع المستخدمين
                  وتظهر لهم رسالة الصيانة أدناه.
                </span>
              </div>
            )}

            <div className="switch-row" style={{ marginBottom: 14 }}>
              <div className="switch-meta">
                <span className="switch-title">تفعيل وضع الصيانة</span>
                <span className="switch-desc">
                  إيقاف مؤقت للتطبيق أثناء الصيانة أو التحديثات الكبرى
                </span>
              </div>
              <ToggleSwitch
                checked={form.maintenance_mode}
                tone="rose"
                onChange={(v) => setForm((p) => ({ ...p, maintenance_mode: v }))}
                ariaLabel="تفعيل وضع الصيانة"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="cfg-maint-msg">
                رسالة الصيانة للمستخدمين (بالعربية)
              </label>
              <textarea
                id="cfg-maint-msg"
                className="textarea"
                placeholder="التطبيق قيد التطوير والصيانة حالياً، سنعود خلال دقائق..."
                value={form.maintenance_message_ar}
                onChange={(e) =>
                  setForm((p) => ({ ...p, maintenance_message_ar: e.target.value }))
                }
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minWidth: 215, padding: '12px 22px' }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={17} className="spinner" />
                  جاري الحفظ والمزامنة...
                </>
              ) : (
                <>
                  <Save size={17} />
                  حفظ الإعدادات ومزامنة التطبيق
                </>
              )}
            </button>
          </div>
        </form>
      ) : subTab === 'content' ? (
        <form onSubmit={handleSaveConfig}>
          {/* 1. Support Links */}
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LifeBuoy size={18} />
                روابط الدعم والتواصل الاجتماعي
              </span>
            </h2>

            <div className="form-grid" style={{ gap: 12 }}>
              {/* Instagram */}
              <div className="glass-subcard" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="switch-title">
                    <Instagram size={16} /> إنستغرام (Instagram)
                  </span>
                  <ToggleSwitch
                    checked={form.instagram_visible}
                    tone="emerald"
                    onChange={(v) => setForm((p) => ({ ...p, instagram_visible: v }))}
                    ariaLabel="إظهار رابط إنستغرام"
                  />
                </div>
                <input
                  type="url"
                  className="input ltr"
                  placeholder="https://instagram.com/vitrify"
                  value={form.instagram_url}
                  onChange={(e) => setForm((p) => ({ ...p, instagram_url: e.target.value }))}
                />
              </div>

              {/* WhatsApp */}
              <div className="glass-subcard" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="switch-title">
                    <MessageCircle size={16} color="var(--emerald)" /> واتساب (WhatsApp)
                  </span>
                  <ToggleSwitch
                    checked={form.whatsapp_visible}
                    tone="emerald"
                    onChange={(v) => setForm((p) => ({ ...p, whatsapp_visible: v }))}
                    ariaLabel="إظهار رابط واتساب"
                  />
                </div>
                <input
                  type="url"
                  className="input ltr"
                  placeholder="https://wa.me/201000000000"
                  value={form.whatsapp_url}
                  onChange={(e) => setForm((p) => ({ ...p, whatsapp_url: e.target.value }))}
                />
              </div>

              {/* Telegram */}
              <div className="glass-subcard" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="switch-title">
                    <Send size={16} color="var(--sky)" /> تيليجرام (Telegram)
                  </span>
                  <ToggleSwitch
                    checked={form.telegram_visible}
                    tone="emerald"
                    onChange={(v) => setForm((p) => ({ ...p, telegram_visible: v }))}
                    ariaLabel="إظهار رابط تيليجرام"
                  />
                </div>
                <input
                  type="url"
                  className="input ltr"
                  placeholder="https://t.me/vitrify"
                  value={form.telegram_url}
                  onChange={(e) => setForm((p) => ({ ...p, telegram_url: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* 2. First-Launch Welcome Message */}
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="var(--amber)" />
                الرسالة الترحيبية عند أول تشغيل
              </span>
              <ToggleSwitch
                checked={form.welcome_enabled}
                tone="emerald"
                onChange={(v) => setForm((p) => ({ ...p, welcome_enabled: v }))}
                ariaLabel="تفعيل الرسالة الترحيبية"
              />
            </h2>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="wel-title">
                  عنوان الترحيب
                </label>
                <input
                  id="wel-title"
                  className="input"
                  value={form.welcome_title_ar}
                  onChange={(e) => setForm((p) => ({ ...p, welcome_title_ar: e.target.value }))}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="wel-cta">
                  نص زر البدء (CTA)
                </label>
                <input
                  id="wel-cta"
                  className="input"
                  value={form.welcome_cta_text}
                  onChange={(e) => setForm((p) => ({ ...p, welcome_cta_text: e.target.value }))}
                />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="wel-body">
                نص الرسالة الترحيبية
              </label>
              <textarea
                id="wel-body"
                className="textarea"
                value={form.welcome_body_ar}
                onChange={(e) => setForm((p) => ({ ...p, welcome_body_ar: e.target.value }))}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="wel-img">
                رابط صورة الترحيب <span className="field-hint">(اختياري)</span>
              </label>
              <input
                id="wel-img"
                type="url"
                className="input ltr"
                placeholder="https://..."
                value={form.welcome_image_url}
                onChange={(e) => setForm((p) => ({ ...p, welcome_image_url: e.target.value }))}
              />
            </div>
          </div>

          {/* 3. Terms & Conditions */}
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} />
                الشروط والأحكام (Terms & Conditions)
              </span>
              {form.terms_updated_at && (
                <span className="badge badge-neutral">
                  آخر تحديث للشروط: {formatDateAr(form.terms_updated_at)}
                </span>
              )}
            </h2>

            <div className="field">
              <label className="field-label" htmlFor="terms-ar">
                نص الشروط والأحكام بالعربية (يتم تحديث تاريخ المراجعة تلقائياً عند التعديل)
              </label>
              <textarea
                id="terms-ar"
                className="textarea"
                style={{ minHeight: 180 }}
                value={form.terms_ar}
                onChange={(e) => setForm((p) => ({ ...p, terms_ar: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minWidth: 220, padding: '12px 22px' }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={17} className="spinner" />
                  جاري الحفظ والمزامنة...
                </>
              ) : (
                <>
                  <Save size={17} />
                  حفظ الدعم والترحيب والشروط
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        /* Sub-tab 3: FAQ Manager */
        <>
          <form onSubmit={handleSaveFaq} className="glass-panel section-card">
            <div className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={18} />
                {faqForm.id ? 'تعديل سؤال شائع' : 'إضافة سؤال شائع جديد'}
              </span>
              {faqForm.id && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFaqForm({ ...EMPTY_FAQ, sort_order: faqItems.length + 1 })}
                >
                  <X size={14} /> إلغاء التعديل
                </button>
              )}
            </div>

            <div className="form-grid" style={{ gap: 12, marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="faq-q">
                  السؤال بالعربية *
                </label>
                <input
                  id="faq-q"
                  className="input"
                  placeholder="مثال: كيف أضيف الويدجيت على الشاشة الرئيسية؟"
                  value={faqForm.question_ar}
                  onChange={(e) => setFaqForm((p) => ({ ...p, question_ar: e.target.value }))}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="faq-a">
                  الإجابة بالعربية *
                </label>
                <textarea
                  id="faq-a"
                  className="textarea"
                  placeholder="اكتب إجابة واضحة ومختصرة للمستخدم..."
                  value={faqForm.answer_ar}
                  onChange={(e) => setFaqForm((p) => ({ ...p, answer_ar: e.target.value }))}
                  required
                />
              </div>

              <div className="form-grid cols-2" style={{ alignItems: 'center' }}>
                <div className="field">
                  <label className="field-label" htmlFor="faq-order">
                    الترتيب
                  </label>
                  <input
                    id="faq-order"
                    type="number"
                    className="input mono"
                    value={faqForm.sort_order}
                    onChange={(e) => setFaqForm((p) => ({ ...p, sort_order: e.target.value }))}
                  />
                </div>

                <div className="switch-row" style={{ marginTop: 20 }}>
                  <span className="switch-title">ظاهر في التطبيق</span>
                  <ToggleSwitch
                    checked={faqForm.is_visible}
                    tone="emerald"
                    onChange={(v) => setFaqForm((p) => ({ ...p, is_visible: v }))}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={faqSaving}>
                {faqForm.id ? <Save size={16} /> : <Plus size={16} />}
                {faqSaving ? 'جاري الحفظ...' : faqForm.id ? 'حفظ التعديل' : 'إضافة السؤال'}
              </button>
            </div>
          </form>

          {faqItems.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <HelpCircle size={24} />
              </div>
              <strong>لا توجد أسئلة شائعة بعد</strong>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {faqItems.map((item, idx) => {
                const busy = faqBusyId === item.id;
                return (
                  <article key={item.id} className="glass-panel faq-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                          <span className="badge badge-neutral mono">#{idx + 1}</span>
                          <strong style={{ fontSize: '0.96rem' }}>{item.question_ar}</strong>
                          {!item.is_visible && <span className="badge badge-rose">مخفي</span>}
                        </div>
                        <p style={{ margin: '7px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                          {item.answer_ar}
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: 30, height: 30 }}
                          disabled={busy || idx === 0}
                          onClick={() => handleReorderFaq(idx, -1)}
                          title="تحريك لأعلى"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: 30, height: 30 }}
                          disabled={busy || idx === faqItems.length - 1}
                          onClick={() => handleReorderFaq(idx, 1)}
                          title="تحريك لأسفل"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <ToggleSwitch
                          checked={item.is_visible}
                          disabled={busy}
                          tone="emerald"
                          onChange={() => handleToggleFaqVisible(item)}
                          ariaLabel={`إظهار سؤال ${item.question_ar}`}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => {
                            setFaqForm({
                              id: item.id,
                              question_ar: item.question_ar,
                              answer_ar: item.answer_ar,
                              sort_order: item.sort_order ?? idx + 1,
                              is_visible: Boolean(item.is_visible),
                            });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          title="تعديل"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => setDeleteFaqTarget(item)}
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <ConfirmDialog
            open={Boolean(deleteFaqTarget)}
            title="حذف السؤال الشائع"
            message={`هل تريد حذف السؤال "${deleteFaqTarget?.question_ar || ''}" نهائياً؟`}
            busy={deletingFaq}
            onConfirm={confirmDeleteFaq}
            onCancel={() => setDeleteFaqTarget(null)}
          />
        </>
      )}
    </section>
  );
}
