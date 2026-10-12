import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download, ExternalLink, Eye, FileCheck, FileText, FolderKanban, Link2, Paperclip, Send, ShieldAlert,
} from 'lucide-react';
import { Modal } from '../common/Primitives';
import { RichTextContent } from '../common/RichTextEditor';
import { request } from '../../api/client';
import { damApi } from '../../api/dam';
import { parseApiError } from '../../api/errors';
import { resourceUrl } from '../../utils/resourceUrl';
import { formatPersianDateLong } from '../../utils/date';
import type { ContentStageInput, ContentStageOutput } from '../../types';

/** نمایش یکپارچهٔ ورودی/خروجی مرحله؛ منبع داده و اکشن‌ها از بیرون تعیین می‌شوند. */
export type StageAssetKind = 'input' | 'output';

export interface StageAssetView {
  id: string;
  kind: StageAssetKind;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: 'ready' | 'waiting';
  /** مرجع نمایشی (مرحله یا بخشی که این مورد به آن تعلق دارد). */
  stageTitle: string;
  /** توضیح زمینهٔ نمایش در کارت و پنجرهٔ پیش‌نمایش. */
  contextLabel: string;
  description?: string;
  value?: string;
  url?: string;
  assetId?: string;
  assetVersionNumber?: number;
  fileName?: string;
  fileSize?: string;
  deliveredAt?: string;
  forwardedToStageTitle?: string;
  forwardedAt?: string;
  sourceStageId?: string;
}

export const inputToAssetView = (input: ContentStageInput, stageTitle: string): StageAssetView => ({
  id: `input-${input.id}`,
  kind: 'input',
  title: input.title || 'ورودی مرحله',
  subtitle: input.sourceOutputId ? 'ارجاع‌شده از خروجی مرحلهٔ قبل' : 'ورودی اعلام‌شدهٔ مرحله',
  statusLabel: input.isReady ? 'آماده' : 'در انتظار',
  statusTone: input.isReady ? 'ready' : 'waiting',
  stageTitle,
  contextLabel: `ورودی مرحلهٔ «${stageTitle}»`,
  description: input.description,
  url: typeof input.contentRef === 'string' && /^https?:\/\//i.test(input.contentRef) ? input.contentRef : undefined,
  assetId: typeof input.contentRef === 'string' && /^\d+$/.test(input.contentRef) ? input.contentRef : undefined,
  forwardedAt: input.forwardedAt ? formatPersianDateLong(input.forwardedAt) : undefined,
  sourceStageId: input.sourceStageId,
  value: typeof input.contentRef === 'string' && !/^\d+$/.test(input.contentRef) && !/^https?:\/\//i.test(input.contentRef)
    ? input.contentRef
    : undefined,
});

export const outputToAssetView = (output: ContentStageOutput, stageTitle: string): StageAssetView => ({
  id: `output-${output.id}`,
  kind: 'output',
  title: output.name || output.fileName || 'خروجی مرحله',
  subtitle: output.fileName ? 'فایل خروجی ثبت‌شده' : 'خروجی تحویل‌شدهٔ مرحله',
  statusLabel: output.isDelivered ? 'تحویل‌شده' : 'در انتظار تحویل',
  statusTone: output.isDelivered ? 'ready' : 'waiting',
  stageTitle,
  contextLabel: `خروجی مرحلهٔ «${stageTitle}»`,
  description: output.value,
  value: output.value,
  url: output.url,
  assetId: output.assetId,
  assetVersionNumber: output.assetVersionNumber,
  fileName: output.fileName,
  fileSize: output.fileSize,
  deliveredAt: output.deliveredAt ? formatPersianDateLong(output.deliveredAt) : undefined,
  forwardedToStageTitle: output.forwardedToStageId ? 'مرحلهٔ بعد' : undefined,
  forwardedAt: output.forwardedAt ? formatPersianDateLong(output.forwardedAt) : undefined,
});

const isDeliveredOutput = (output: ContentStageOutput) =>
  Boolean(output.isDelivered || output.value || output.url || output.assetId || output.fileName);

export const deliveredOutputs = (stage: { outputs?: ContentStageOutput[] }) => (stage.outputs || []).filter(isDeliveredOutput);
export const pendingOutputs = (stage: { outputs?: ContentStageOutput[] }) => (stage.outputs || []).filter(output => !isDeliveredOutput(output));

const fileKindOf = (view: StageAssetView): 'text' | 'link' | 'file' | 'asset' => {
  if (view.assetId) return 'asset';
  if (resourceUrl(view.url)) return 'link';
  if (view.value) return 'text';
  return 'file';
};

/** کارت یک ورودی یا خروجی؛ ظاهر و رفتار هر دو یکسان است. */
export function StageAssetCard({ view, onPreview, actions }: {
  view: StageAssetView;
  onPreview: (view: StageAssetView) => void;
  actions?: React.ReactNode;
  key?: React.Key;
}) {
  const kind = fileKindOf(view);
  const Icon = kind === 'link' ? Link2 : kind === 'text' ? FileText : FileCheck;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-colors hover:border-indigo-200 hover:bg-indigo-50/20">
      <button type="button" onClick={() => onPreview(view)} className="flex flex-1 items-start gap-3 p-3.5 text-right">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="break-words text-xs font-black leading-5 text-slate-900">{view.title}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${view.statusTone === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{view.statusLabel}</span>
          </span>
          {view.description
            ? <span className="mt-1.5 line-clamp-2 block whitespace-pre-wrap text-[10px] leading-5 text-slate-500">{view.description}</span>
            : <span className="mt-1.5 block text-[10px] text-slate-400">{view.subtitle} · برای مشاهدهٔ پیش‌نمایش کارت را باز کنید.</span>}
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {view.fileName && <span className="max-w-[190px] truncate rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600" title={view.fileName}><Paperclip className="ml-1 inline h-3 w-3" />{view.fileName}</span>}
            {view.fileSize && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] text-slate-500">{view.fileSize}</span>}
            {view.assetId && <span className="rounded-lg bg-sky-50 px-2 py-1 text-[9px] font-bold text-sky-700">ثبت‌شده در مخزن{view.assetVersionNumber ? ` · نسخهٔ ${view.assetVersionNumber.toLocaleString('fa-IR')}` : ''}</span>}
            {resourceUrl(view.url) && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[9px] font-bold text-indigo-700">دارای پیوند</span>}
            {view.forwardedToStageTitle && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[9px] font-bold text-indigo-700">ارجاع‌شده{view.forwardedAt ? ` · ${view.forwardedAt}` : ''}</span>}
          </span>
          <span className="mt-2 block text-[9px] text-slate-400">{view.contextLabel}</span>
        </span>
      </button>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-3.5 py-2">
        <span className="text-[9px] text-slate-400">{view.kind === 'input' ? 'ورودی' : 'خروجی'}</span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button type="button" onClick={() => onPreview(view)} className="ui-button ui-button-ghost !min-h-7 !rounded-lg !px-2 !py-1 text-[10px]"><Eye className="h-3.5 w-3.5" />پیش‌نمایش</button>
          {actions}
        </div>
      </footer>
    </article>
  );
}

/** بخش ورودی‌ها یا خروجی‌های یک مرحله با سربرگ و شبکهٔ یکسان. */
export function StageAssetSection({ kind, items, title, description, action, emptyTitle, emptyHint, pendingTitles, onPreview, renderActions }: {
  kind: StageAssetKind;
  items: StageAssetView[];
  title: string;
  description: string;
  action?: React.ReactNode;
  emptyTitle: string;
  emptyHint: string;
  pendingTitles?: string[];
  onPreview: (view: StageAssetView) => void;
  renderActions?: (view: StageAssetView) => React.ReactNode;
}) {
  const accent = kind === 'input' ? 'border-sky-100 bg-sky-50/45' : 'border-indigo-100 bg-indigo-50/45';
  const iconTone = kind === 'input' ? 'text-sky-600 border-sky-100' : 'text-indigo-600 border-indigo-100';
  const countTone = kind === 'input' ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700';
  return (
    <section className={`overflow-hidden rounded-2xl border ${accent}`}>
      <header className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between ${kind === 'input' ? 'border-sky-100' : 'border-indigo-100'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-2xs ${iconTone}`}>
            {kind === 'input' ? <Paperclip className="h-5 w-5" /> : <FileCheck className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-slate-800">{title}</h4>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${countTone}`}>{items.length.toLocaleString('fa-IR')} مورد</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{description}</p>
          </div>
        </div>
        {action}
      </header>
      <div className="p-3 sm:p-4">
        {items.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map(view => <StageAssetCard key={view.id} view={view} onPreview={onPreview} actions={renderActions?.(view)} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-300 shadow-2xs">
              {kind === 'input' ? <Paperclip className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </span>
            <p className="mt-2 text-[11px] font-bold text-slate-500">{emptyTitle}</p>
            <p className="mt-1 text-[9px] text-slate-400">{emptyHint}</p>
          </div>
        )}
        {!!pendingTitles?.length && (
          <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-2.5">
            <p className="mb-1.5 text-[9px] font-black text-amber-700">{kind === 'input' ? 'ورودی‌های مورد انتظار' : 'خروجی‌های مورد انتظار'}</p>
            <div className="flex flex-wrap gap-1.5">
              {pendingTitles.map(title => <span key={title} className="rounded-lg border border-amber-100 bg-white px-2 py-1 text-[9px] font-bold text-slate-600">{title}</span>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type DamAssetDetail = {
  id: number | string;
  title: string;
  type: 'file' | 'content';
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
  content_item?: { content_body?: string } | null;
};

type PreviewPayload =
  | { mode: 'text'; html: string }
  | { mode: 'image'; src: string }
  | { mode: 'media'; src: string; media: 'audio' | 'video' }
  | { mode: 'document'; src: string }
  | { mode: 'unsupported'; reason: string }
  | { mode: 'link'; url: string }
  | { mode: 'empty' };

/** پیش‌نمایش دارایی مخزن بر پایهٔ قالب واقعی فایل. */
const assetPayload = (asset: DamAssetDetail): PreviewPayload => {
  const mime = (asset.latest_file?.mime_type || '').toLowerCase();
  const previewUrl = damApi.library.previewUrl(asset.id);
  if (asset.type === 'content' || asset.content_item?.content_body) {
    return { mode: 'text', html: asset.content_item?.content_body || '' };
  }
  if (!asset.latest_file) return { mode: 'unsupported', reason: 'این دارایی فایل قابل پیش‌نمایش ندارد.' };
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return { mode: 'image', src: previewUrl };
  if (mime.startsWith('audio/')) return { mode: 'media', src: previewUrl, media: 'audio' };
  if (mime.startsWith('video/')) return { mode: 'media', src: previewUrl, media: 'video' };
  if (mime === 'application/pdf' || mime === 'text/plain') return { mode: 'document', src: previewUrl };
  return { mode: 'unsupported', reason: `پیش‌نمایش مستقیم قالب «${mime || 'نامشخص'}» پشتیبانی نمی‌شود؛ فایل را دانلود کنید.` };
};

/** پیش‌نمایش بدون مخزن: پیوند یا متن ثبت‌شده روی همان ورودی/خروجی. */
const inlinePayload = (view: StageAssetView): PreviewPayload => {
  if (view.url) {
    const resolved = resourceUrl(view.url);
    if (resolved) {
      return /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(resolved)
        ? { mode: 'image', src: resolved }
        : { mode: 'link', url: resolved };
    }
  }
  if (view.value) return { mode: 'text', html: `<p>${view.value.replace(/[<>&]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[character] as string))}</p>` };
  return { mode: 'empty' };
};

/** پیش‌نمایش درون‌صفحه‌ای ورودی/خروجی بدون خروج از صفحهٔ جزئیات محتوا. */
export function StageAssetPreviewModal({ view, onClose, onOpenInDam, canLoadAsset = true }: {
  view: StageAssetView | null;
  onClose: () => void;
  onOpenInDam?: (assetId: string) => void;
  /** بدون مجوز مشاهدهٔ مخزن، فقط داده‌های همان ورودی/خروجی نمایش داده می‌شود. */
  canLoadAsset?: boolean;
}) {
  const assetId = view?.assetId && /^\d+$/.test(view.assetId) ? view.assetId : undefined;
  const asset = useQuery({
    queryKey: ['dam-asset', 'preview', assetId],
    queryFn: () => request<{ data: DamAssetDetail }>(`/dam/library/${assetId}`).then(response => response.data),
    enabled: Boolean(assetId && canLoadAsset),
    staleTime: 60_000,
    retry: false,
  });
  const payload: PreviewPayload = view
    ? (asset.data ? assetPayload(asset.data) : inlinePayload(view))
    : { mode: 'empty' };
  const waitingForAsset = Boolean(assetId && canLoadAsset && asset.isLoading && payload.mode === 'empty');
  const downloadUrl = assetId && canLoadAsset ? `/api/v1/dam/library/${assetId}/download` : undefined;

  return <Modal
    open={Boolean(view)}
    onClose={onClose}
    title={view?.title || 'پیش‌نمایش'}
    description={view?.contextLabel}
    icon={view?.kind === 'input' ? <Paperclip className="h-5 w-5" /> : <FileCheck className="h-5 w-5" />}
    size="xl"
    panelScroll={false}
  >
    {view && <div className="flex max-h-[calc(94dvh-82px)] min-h-[45dvh] flex-col">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold text-slate-600">
        <span className={`rounded-lg px-2 py-1 ${view.statusTone === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{view.statusLabel}</span>
        {view.fileName && <span className="rounded-lg bg-white px-2 py-1"><Paperclip className="ml-1 inline h-3 w-3" />{view.fileName}</span>}
        {view.fileSize && <span className="rounded-lg bg-white px-2 py-1">{view.fileSize}</span>}
        {view.deliveredAt && <span className="rounded-lg bg-white px-2 py-1">تحویل: {view.deliveredAt}</span>}
        {view.forwardedToStageTitle && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700"><Send className="ml-1 inline h-3 w-3" />ارجاع به {view.forwardedToStageTitle}{view.forwardedAt ? ` · ${view.forwardedAt}` : ''}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {waitingForAsset && <p className="text-xs font-bold text-indigo-600">در حال دریافت پیش‌نمایش…</p>}
        {asset.isError && <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-800">مشاهدهٔ فایل این مورد در مخزن ممکن نشد: {parseApiError(asset.error).message}</p>}

        {payload.mode === 'text' && <RichTextContent html={payload.html} emptyText="متنی برای نمایش ثبت نشده است." className="mx-auto max-w-4xl text-sm leading-8" />}
        {payload.mode === 'image' && <img src={payload.src} alt={view.title} className="mx-auto max-h-[55dvh] w-auto rounded-2xl border border-slate-200 object-contain" />}
        {payload.mode === 'media' && (payload.media === 'audio'
          ? <audio src={payload.src} controls className="w-full" />
          : <video src={payload.src} controls className="mx-auto max-h-[55dvh] w-full rounded-2xl border border-slate-200" />)}
        {payload.mode === 'document' && <iframe src={payload.src} title={view.title} className="h-[55dvh] w-full rounded-2xl border border-slate-200" />}
        {payload.mode === 'link' && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" dir="ltr"><p className="break-all font-mono text-[11px] text-slate-600">{payload.url}</p></div>}
        {payload.mode === 'unsupported' && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-6">{payload.reason}</p></div>}
        {payload.mode === 'empty' && <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">برای این مورد فایل یا متنی ثبت نشده است؛ فقط توضیحات ورودی/خروجی موجود است.</p>}

        {view.description && payload.mode !== 'text' && <section className="mt-4">
          <h4 className="mb-2 text-[11px] font-black text-slate-700">توضیحات و گزارش</h4>
          <p className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-7 text-slate-600">{view.description}</p>
        </section>}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
        {assetId && onOpenInDam && <button type="button" onClick={() => { onOpenInDam(assetId); onClose(); }} className="ui-button ui-button-secondary"><FolderKanban className="h-4 w-4" />نمایش در مخزن</button>}
        {downloadUrl && <a href={downloadUrl} className="ui-button ui-button-secondary" download><Download className="h-4 w-4" />دانلود فایل</a>}
        {payload.mode === 'link' && <a href={payload.url} target="_blank" rel="noopener noreferrer" className="ui-button ui-button-primary"><ExternalLink className="h-4 w-4" />بازکردن پیوند</a>}
        <button type="button" onClick={onClose} className="ui-button ui-button-ghost">بستن</button>
      </footer>
    </div>}
  </Modal>;
}

