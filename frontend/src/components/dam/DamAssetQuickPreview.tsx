import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, FileText, FolderTree, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import { apiConfig, request } from '../../api/client';
import { apiErrorMessage } from '../../api/errors';
import { Modal } from '../common/Primitives';
import { RichTextContent } from '../common/RichTextEditor';
import { useApp } from '../../context/AppContext';

/** کمینهٔ اطلاعاتی که فهرست مخزن برای پیش‌نمایش می‌دهد. */
export interface QuickPreviewAsset {
  id: number;
  title: string;
  type?: 'file' | 'content';
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
  latest_version?: { id: number; version_number: number } | null;
}

interface AssetDetail {
  id: number | string;
  title?: string;
  type?: 'file' | 'content';
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
  content_item?: { content_body?: string } | null;
  folder?: { id?: number; name?: string } | null;
}

type PreviewPayload =
  | { mode: 'loading' }
  | { mode: 'text'; html: string }
  | { mode: 'image'; src: string }
  | { mode: 'media'; src: string; media: 'audio' | 'video' }
  | { mode: 'document'; src: string }
  | { mode: 'blocked'; reason: string }
  | { mode: 'unsupported'; reason: string }
  | { mode: 'error'; reason: string };

const sizeLabel = (bytes?: number | null) => {
  if (!bytes) return 'بدون حجم';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
};

/** قالب فایل از روی mime، همان قالب‌هایی که سرور در `preview` می‌پذیرد. */
const mimeKind = (mime: string): 'image' | 'audio' | 'video' | 'document' | 'other' => {
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf' || mime === 'text/plain') return 'document';
  return 'other';
};

/**
 * پیش‌نمایش سریع یک دارایی مخزن، پیش از اتصال آن به ضمیمه‌ها.
 *
 * همان قالب واقعی فایل نمایش داده می‌شود: تصویر، صدا، ویدیو، PDF/متن ساده و
 * دارایی متنی (یادداشت) با همان متن ذخیره‌شده. پیش‌نمایش فایل از مسیر محافظت‌شدهٔ
 * `dam/library/{id}/preview` می‌آید که مجوز `assets.preview` می‌خواهد (یا عضویت
 * در محتوای مرتبط، مثل صفحهٔ مخزن)؛ بدون آن مجوز، جای تصویر شکسته پیام روشن
 * نمایش داده می‌شود و فقط مشخصات فایل و امکان دانلود (با `assets.download`) می‌ماند.
 */
export function DamAssetQuickPreview({
  asset, onClose, selected = false, onToggleSelect, destinationLabel, linkedContentAccess = false, hint,
}: {
  asset: QuickPreviewAsset | null;
  onClose: () => void;
  selected?: boolean;
  /** انتخاب/حذف از فهرست آمادهٔ اتصال، بدون بستن پنجرهٔ پیش‌نمایش. */
  onToggleSelect?: () => void;
  /** مسیر/برچسب مقصد پس از ذخیره (یادآوری در پیش‌نمایش). */
  destinationLabel?: string;
  /** کاربر عضو محتوای مرتبط است؛ سرور پیش‌نمایش دارایی‌های همان محتوا را هم می‌دهد. */
  linkedContentAccess?: boolean;
  /** توضیح پایین پیش‌نمایش؛ برای دارایی‌های ثبت‌شده پیام «پیش از اتصال» گمراه‌کننده است. */
  hint?: string;
}) {
  const { hasPermission } = useApp();
  const assetId = asset?.id;
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => { setLoadFailed(false); }, [assetId]);

  const detail = useQuery({
    queryKey: ['dam-asset', 'quick-preview', assetId],
    queryFn: () => request<{ data: AssetDetail }>(`/dam/library/${assetId}`).then(response => response.data),
    enabled: Boolean(assetId),
    staleTime: 60_000,
    retry: false,
  });

  const canPreviewFile = hasPermission('assets.preview') || hasPermission('assets.view') || linkedContentAccess;
  const canDownload = hasPermission('assets.download') || linkedContentAccess;
  const data = detail.data;

  const payload: PreviewPayload = (() => {
    if (!asset) return { mode: 'loading' };
    const mime = (data?.latest_file?.mime_type || asset.latest_file?.mime_type || '').toLowerCase();
    const kind = mimeKind(mime);
    const isTextAsset = data?.type === 'content' || asset.type === 'content' || Boolean(data?.content_item?.content_body);
    // خطای دریافت جزئیات فقط وقتی مانع است که فهرست هم mime نداده باشد؛ اطلاعات فهرست کافی است.
    if (detail.isError && !mime && !isTextAsset) return { mode: 'error', reason: apiErrorMessage(detail.error, 'دریافت پیش‌نمایش ناموفق بود.') };
    if (detail.isLoading && !mime && !isTextAsset) return { mode: 'loading' };
    if (isTextAsset) return { mode: 'text', html: data?.content_item?.content_body || '' };
    if (!mime) return { mode: 'unsupported', reason: 'این دارایی فایلی برای پیش‌نمایش ندارد.' };
    if (!canPreviewFile) return { mode: 'blocked', reason: 'برای دیدن پیش‌نمایش فایل‌های مخزن به مجوز «پیش‌نمایش محتوای فایل» نیاز دارید.' };
    if (kind === 'other') {
      return { mode: 'unsupported', reason: `پیش‌نمایش مستقیم قالب «${mime}» پشتیبانی نمی‌شود؛ فایل را دانلود کنید یا در مخزن باز کنید.` };
    }
    const src = `${apiConfig.baseUrl}/dam/library/${asset.id}/preview`;
    if (kind === 'image') return { mode: 'image', src };
    if (kind === 'audio') return { mode: 'media', src, media: 'audio' };
    if (kind === 'video') return { mode: 'media', src, media: 'video' };
    return { mode: 'document', src };
  })();

  const fileName = data?.latest_file?.original_filename || asset?.latest_file?.original_filename || asset?.title || '';
  const fileSize = sizeLabel(data?.latest_file?.file_size ?? asset?.latest_file?.file_size ?? null);
  const version = asset?.latest_version?.version_number;
  const showFailure = loadFailed && (payload.mode === 'image' || payload.mode === 'media' || payload.mode === 'document');

  return (
    <Modal
      open={Boolean(asset)}
      onClose={onClose}
      size="xl"
      panelScroll={false}
      title={asset?.title || 'پیش‌نمایش دارایی'}
      description={fileName && fileName !== asset?.title ? fileName : undefined}
      icon={<FileText className="h-5 w-5" />}
    >
      {asset && (
        <div className="flex max-h-[calc(94dvh-82px)] min-h-[45dvh] flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold text-slate-600">
            <span className="rounded-lg bg-white px-2 py-1">حجم: {fileSize}</span>
            {version ? <span className="rounded-lg bg-white px-2 py-1">نسخهٔ {version.toLocaleString('fa-IR')}</span> : null}
            {data?.folder?.name ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1">
                <FolderTree className="h-3 w-3" aria-hidden="true" />{data.folder.name}
              </span>
            ) : null}
            {destinationLabel ? <span className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700">{destinationLabel}</span> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-4 sm:p-5">
            {payload.mode === 'loading' && (
              <p className="flex items-center justify-center gap-2 py-12 text-xs font-bold text-indigo-600">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                در حال دریافت پیش‌نمایش…
              </p>
            )}
            {payload.mode === 'error' && (
              <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-6 text-rose-700">{payload.reason}</p>
            )}
            {payload.mode === 'blocked' && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900" role="alert">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{payload.reason}</span>
              </div>
            )}
            {payload.mode === 'text' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <RichTextContent html={payload.html} emptyText="برای این دارایی متنی، متنی ثبت نشده است." />
              </div>
            )}
            {payload.mode === 'image' && !showFailure && (
              <img src={payload.src} alt={asset.title} onError={() => setLoadFailed(true)} className="mx-auto max-h-[55dvh] w-auto rounded-2xl border border-slate-200 bg-white object-contain" />
            )}
            {payload.mode === 'media' && !showFailure && (payload.media === 'audio'
              ? <audio src={payload.src} controls onError={() => setLoadFailed(true)} className="w-full" />
              : <video src={payload.src} controls onError={() => setLoadFailed(true)} className="mx-auto max-h-[55dvh] w-full rounded-2xl border border-slate-200 bg-black" />)}
            {payload.mode === 'document' && (
              <iframe src={payload.src} title={asset.title} onError={() => setLoadFailed(true)} className="h-[55dvh] w-full rounded-2xl border border-slate-200 bg-white" />
            )}
            {showFailure && (
              <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>فایل پیش‌نمایش بارگذاری نشد؛ ممکن است مجوز «پیش‌نمایش محتوای فایل» را نداشته باشید یا فایل از مخزن حذف شده باشد. مشخصات فایل بالا نمایش داده می‌شود و اتصال آن به ضمیمه‌ها همچنان ممکن است.</span>
              </div>
            )}
            {payload.mode === 'unsupported' && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{payload.reason}</span>
              </div>
            )}
            <p className="mt-3 text-[10px] leading-5 text-slate-400">
              {hint || 'این پیش‌نمایش فقط برای بررسی پیش از اتصال است؛ فایل تکثیر نمی‌شود و اتصال پس از ذخیرهٔ فرم انجام می‌شود.'}
            </p>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
            {canDownload && payload.mode !== 'text' && (
              <a
                href={`${apiConfig.baseUrl}/dam/library/${asset.id}/download`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                دانلود فایل
              </a>
            )}
            {onToggleSelect && (
              <button
                type="button"
                onClick={onToggleSelect}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-bold text-white ${selected ? 'bg-slate-600 hover:bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {selected ? <X className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {selected ? 'حذف از انتخاب' : 'انتخاب برای اتصال'}
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
              بستن
            </button>
          </footer>
        </div>
      )}
    </Modal>
  );
}
