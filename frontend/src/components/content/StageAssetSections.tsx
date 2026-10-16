import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown, Download, ExternalLink, Eye, FileCheck, FileText, FolderKanban, Link2, Paperclip, Pencil, Send, ShieldAlert, TableProperties,
} from 'lucide-react';
import { Modal } from '../common/Primitives';
import { RichTextContent, RichTextEditor, hasRichTextContent, richTextToPlainText, sanitizeRichTextHtml } from '../common/RichTextEditor';
import { request } from '../../api/client';
import { damApi } from '../../api/dam';
import { ApiError, apiErrorMessage, parseApiError } from '../../api/errors';
import { resourceUrl } from '../../utils/resourceUrl';
import { dataTableIdFromOutputValue, dataTableRowFields } from '../../utils/dataTableRows';
import { formatPersianDateLong } from '../../utils/date';
import type { ContentStageInput, ContentStageOutput } from '../../types';

/** نمایش یکپارچهٔ ورودی/خروجی مرحله؛ منبع داده و اکشن‌ها از بیرون تعیین می‌شوند. */
export type StageAssetKind = 'input' | 'output';

/** خروجی‌ای که خودش ردیفی (یا چند ردیف) از «جدول اطلاعات» است. */
export type StageAssetDataTable = {
  id: number;
  name?: string;
  rowIds: number[];
  /** برچسب ردیف‌ها در لحظهٔ تحویل؛ اگر جدول بعداً تغییر کند همچنان خوانا می‌ماند. */
  rowLabels?: string[];
};

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
  /** مرحله و شناسهٔ خودِ خروجی؛ ویرایش متن خروجی فقط با همین دو ممکن است. */
  stageId?: string;
  outputId?: string;
  /** وقتی خروجی از «جدول اطلاعات» آمده است: جدول و ردیف‌های همان خروجی. */
  dataTable?: StageAssetDataTable;
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

/**
 * اگر خروجی ردیفی از «جدول اطلاعات» باشد، جدول و ردیف‌های همان خروجی را برمی‌گرداند.
 * پیوند ساختاریافته مقدم است؛ برای خروجی‌هایی که پیش از این پیوند ساخته شده‌اند،
 * فقط همان جملهٔ ساخت‌یافتهٔ سامانه در متن خوانده می‌شود و هیچ حدسی زده نمی‌شود.
 */
const outputDataTableRef = (output: ContentStageOutput): StageAssetDataTable | undefined => {
  const rowIds = (output.rowIds || []).map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0);
  const structured = Number(output.dataTableId);
  if (Number.isFinite(structured) && structured > 0) {
    return { id: structured, name: output.dataTableName, rowIds, rowLabels: output.rowLabels };
  }
  const legacy = dataTableIdFromOutputValue(output.value);
  return legacy ? { id: legacy, rowIds: [] } : undefined;
};

export const outputToAssetView = (output: ContentStageOutput, stageTitle: string, stageId?: string): StageAssetView => ({
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
  dataTable: outputDataTableRef(output),
  stageId,
  outputId: output.id,
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
            {view.kind === 'input' && view.sourceStageId && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[9px] font-bold text-indigo-700">ارجاع‌شده از مرحلهٔ قبل{view.forwardedAt ? ` · ${view.forwardedAt}` : ''}</span>}
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

/* ── باز/بسته بودن بخش‌های ورودی و خروجی ──
   پیش‌فرض همهٔ بخش‌ها «بسته» است تا کارت مرحله‌ها جمع‌وجور بمانند. انتخاب کاربر
   فقط در همین نشست (in-memory) به یاد می‌ماند و با بارگذاری دوبارهٔ صفحه به
   حالت پیش‌فرض بسته برمی‌گردد؛ هیچ چیزی در مرورگر ذخیره نمی‌شود. */
const SECTION_STATE: Partial<Record<StageAssetKind, boolean>> = {};

const readSectionState = (kind: StageAssetKind): boolean | undefined => SECTION_STATE[kind];

const writeSectionState = (kind: StageAssetKind, open: boolean) => {
  SECTION_STATE[kind] = open;
};

/**
 * بخش ورودی‌ها یا خروجی‌های یک مرحله: سربرگ، شمارنده‌های وضعیت و شبکهٔ کارت‌ها یکسان‌اند و
 * هر بخش با دکمهٔ سربرگ باز و بسته می‌شود. پیش‌فرض «بسته» است و انتخاب کاربر فقط در
 * همان نشست به یاد می‌ماند (بدون ذخیره در مرورگر).
 */
export function StageAssetSection({
  kind, items, title, description, action, emptyTitle, emptyHint, pendingTitles, onPreview, renderActions, defaultOpen,
}: {
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
  /** وضعیت اولیه؛ پیش‌فرض همهٔ بخش‌ها بسته است مگر صریحاً باز خواسته شود. */
  defaultOpen?: boolean;
}) {
  const accent = kind === 'input' ? 'border-sky-100 bg-sky-50/45' : 'border-indigo-100 bg-indigo-50/45';
  const iconTone = kind === 'input' ? 'text-sky-600 border-sky-100' : 'text-indigo-600 border-indigo-100';
  const countTone = kind === 'input' ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700';
  const borderTone = kind === 'input' ? 'border-sky-100' : 'border-indigo-100';
  const bodyId = React.useId();
  const readyCount = items.filter(item => item.statusTone === 'ready').length;
  const waitingCount = items.length - readyCount;
  const pendingCount = pendingTitles?.length || 0;
  const [open, setOpen] = React.useState(() => readSectionState(kind) ?? defaultOpen ?? false);
  const toggle = () => setOpen(current => {
    const next = !current;
    writeSectionState(kind, next);
    return next;
  });
  // در حالت بسته، پیش‌نویس‌ها (اقلام ثبت‌نشده) با نام دیده می‌شوند تا پنهان نمانند.
  const pendingPreview = (pendingTitles || []).slice(0, 2);
  const pendingNames = pendingPreview.map(title => `«${title}»`).join('، ');
  const summary = [
    items.length > 0 ? `${items.length.toLocaleString('fa-IR')} مورد` : '',
    readyCount > 0 ? `${readyCount.toLocaleString('fa-IR')} آماده` : '',
    waitingCount > 0 ? `${waitingCount.toLocaleString('fa-IR')} در انتظار` : '',
    pendingCount > 0
      ? `${pendingCount.toLocaleString('fa-IR')} مورد پیش‌نویس${pendingNames ? `: ${pendingNames}${pendingCount > pendingPreview.length ? ' و …' : ''}` : ''}`
      : '',
    items.length === 0 && pendingCount === 0 ? 'برای این مرحله موردی ثبت نشده است' : '',
  ].filter(Boolean).join(' · ');

  return (
    <section className={`overflow-hidden rounded-2xl border ${accent}`}>
      <header className={`flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${open ? `border-b ${borderTone}` : ''}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          title={open ? 'بستن این بخش' : 'باز کردن این بخش'}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-right transition-colors hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-2xs ${iconTone}`}>
            {kind === 'input' ? <Paperclip className="h-5 w-5" /> : <FileCheck className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs font-black text-slate-800">{title}</h4>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${countTone}`}>{items.length.toLocaleString('fa-IR')} مورد</span>
              {readyCount > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">{readyCount.toLocaleString('fa-IR')} آماده</span>}
              {waitingCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">{waitingCount.toLocaleString('fa-IR')} در انتظار</span>}
              {pendingCount > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600" title={pendingTitles?.join('، ')}>{pendingCount.toLocaleString('fa-IR')} پیش‌نویس/پیش‌بینی‌شده</span>}
            </span>
            <span className="mt-1 block text-[10px] leading-5 text-slate-500">{open ? description : summary}</span>
          </span>
          <span
            aria-hidden="true"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{action}</div>}
      </header>
      <div id={bodyId} className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden" inert={!open}>
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
        </div>
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

/** متن ساده را برای نمایش امن در HTML آماده می‌کند. */
const escapeHtmlText = (value: string): string =>
  value.replace(/[<>&]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[character] as string));

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
  if (view.value) return { mode: 'text', html: `<p>${escapeHtmlText(view.value)}</p>` };
  return { mode: 'empty' };
};

/** ردیف و ستون جدول اطلاعات، همان‌قدر که پیش‌نمایش نیاز دارد. */
type PreviewTableRow = { id: number; cells?: Record<string, string> };
type PreviewTableColumn = { id: string; name?: string };

/** پیش‌نمایش درون‌صفحه‌ای ورودی/خروجی بدون خروج از صفحهٔ جزئیات محتوا. */
export function StageAssetPreviewModal({
  view, onClose, onOpenInDam, onOpenDataTable, onEditText, canLoadAsset = true, canEditTextAsset = false,
}: {
  view: StageAssetView | null;
  onClose: () => void;
  onOpenInDam?: (assetId: string) => void;
  /** رفتن به «جدول اطلاعات» همان خروجی؛ بدون این تابع، دکمهٔ رفتن نمایش داده نمی‌شود. */
  onOpenDataTable?: (tableId: number) => void;
  /**
   * ذخیرهٔ متنِ خروجی‌ای که دارایی مخزن ندارد (متن همان جریان). متن ساده ذخیره
   * می‌شود تا کارت‌ها و گزارش‌ها همان چیزی را نشان دهند که کاربر نوشته است.
   */
  onEditText?: (view: StageAssetView, plainText: string) => Promise<void>;
  /** بدون مجوز مشاهدهٔ مخزن، فقط داده‌های همان ورودی/خروجی نمایش داده می‌شود. */
  canLoadAsset?: boolean;
  /** ویرایش متن داراییِ مخزن مجوز جدا دارد (`assets.edit_info`). */
  canEditTextAsset?: boolean;
}) {
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textNote, setTextNote] = useState('');
  const [textSaving, setTextSaving] = useState(false);
  const [textError, setTextError] = useState('');
  /** متنی که همین حالا ذخیره شده؛ تا پیش از پاسخ دوبارهٔ سرور همین نمایش داده می‌شود. */
  const [savedTextHtml, setSavedTextHtml] = useState<string | null>(null);
  const assetId = view?.assetId && /^\d+$/.test(view.assetId) ? view.assetId : undefined;
  const asset = useQuery({
    queryKey: ['dam-asset', 'preview', assetId],
    queryFn: () => request<{ data: DamAssetDetail }>(`/dam/library/${assetId}`).then(response => response.data),
    enabled: Boolean(assetId && canLoadAsset),
    staleTime: 60_000,
    retry: false,
  });
  const viewTable = view?.dataTable;
  /**
   * اطلاعات ردیف از خود جدول خوانده می‌شود (نه از متن ذخیره‌شده روی خروجی)، پس
   * اگر ردیف بعداً ویرایش شود، همان چیزی دیده می‌شود که در جدول است. شناسه‌های
   * ردیف به مسیر `row_ids` می‌روند و مستقل از صفحه‌بندی برگردانده می‌شوند.
   */
  const tableRows = useQuery({
    queryKey: ['dam-table', 'preview-rows', viewTable?.id, (viewTable?.rowIds || []).join(',')],
    queryFn: () => request<{ data: { columns?: PreviewTableColumn[]; pinned_rows?: PreviewTableRow[] } }>(
      `/dam/data-tables/${viewTable!.id}?per_page=1&${(viewTable!.rowIds || []).map(id => `row_ids[]=${id}`).join('&')}`,
    ).then(response => response.data),
    enabled: Boolean(viewTable && canLoadAsset && (viewTable.rowIds || []).length > 0),
    staleTime: 30_000,
    retry: false,
  });
  const tableRowList = tableRows.data?.pinned_rows || [];
  const payload: PreviewPayload = view
    ? (asset.data ? assetPayload(asset.data) : inlinePayload(view))
    : { mode: 'empty' };
  const waitingForAsset = Boolean(assetId && canLoadAsset && asset.isLoading && payload.mode === 'empty');
  const downloadUrl = assetId && canLoadAsset ? `/api/v1/dam/library/${assetId}/download` : undefined;
  // متنِ داراییِ مخزن با ساخت نسخهٔ تازه ویرایش می‌شود؛ متنِ خروجی بدون دارایی
  // همان‌جا در جریان ذخیره می‌شود. هر دو از یک دکمه و یک ویرایشگر استفاده می‌کنند.
  const assetTextEditable = Boolean(assetId && canEditTextAsset);
  const flowTextEditable = Boolean(onEditText && view && view.kind === 'output' && !assetId);
  const textEditable = assetTextEditable || flowTextEditable;
  const displayTextHtml = savedTextHtml !== null ? savedTextHtml : (payload.mode === 'text' ? payload.html : '');

  const startTextEdit = () => {
    setTextError('');
    setTextNote('');
    setTextDraft(displayTextHtml || (view?.value ? `<p>${escapeHtmlText(view.value)}</p>` : ''));
    setEditingText(true);
  };

  const saveText = async () => {
    if (!view || textSaving) return;
    setTextSaving(true);
    setTextError('');
    try {
      const clean = sanitizeRichTextHtml(textDraft);
      if (!hasRichTextContent(clean)) throw new Error('متن نمی‌تواند خالی باشد.');
      if (assetTextEditable) {
        await damApi.library.reviseText(assetId as string, clean, textNote.trim() || undefined);
        await asset.refetch();
        setSavedTextHtml(clean);
      } else if (flowTextEditable && onEditText) {
        const plain = richTextToPlainText(clean).trim();
        await onEditText(view, plain);
        setSavedTextHtml(`<p>${escapeHtmlText(plain)}</p>`);
      } else {
        throw new Error('برای این مورد امکان ویرایش متن وجود ندارد.');
      }
      setEditingText(false);
    } catch (error) {
      setTextError(error instanceof ApiError ? apiErrorMessage(error) : error instanceof Error ? error.message : 'ذخیرهٔ متن انجام نشد.');
    } finally {
      setTextSaving(false);
    }
  };

  // با عوض‌شدن مورد پیش‌نمایش (یا بسته‌شدن مدال) حالت ویرایش پاک می‌شود تا متن
  // مورد قبلی روی مورد تازه نماند.
  React.useEffect(() => {
    setEditingText(false);
    setSavedTextHtml(null);
    setTextError('');
  }, [view?.id]);

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

        {textEditable && !editingText && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          <span className="text-[10px] font-bold leading-5 text-indigo-700">{assetTextEditable ? 'ویرایش، نسخهٔ تازهٔ همین دارایی متنی را می‌سازد و متن قبلی در تاریخ نسخه‌ها می‌ماند.' : 'این متن بخشی از خروجی همین مرحله است و همان‌جا ذخیره می‌شود.'}</span>
          <button type="button" onClick={startTextEdit} className="ui-button ui-button-secondary !min-h-8 !rounded-xl !px-3 !py-1.5 text-[10px]"><Pencil className="h-3.5 w-3.5" />ویرایش متن</button>
        </div>}
        {editingText && <div className="mb-4 space-y-3 rounded-2xl border border-indigo-200 bg-white p-4">
          {textError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] font-bold text-rose-700">{textError}</p>}
          <RichTextEditor value={textDraft} onChange={setTextDraft} label="متن خروجی" placeholder="متن خروجی را بنویسید…" minHeight={220} />
          {assetTextEditable && <input value={textNote} onChange={event => setTextNote(event.target.value)} placeholder="توضیح این تغییر (اختیاری)" aria-label="توضیح تغییر متن" className="ui-input text-[11px]" />}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="ui-button ui-button-secondary" disabled={textSaving} onClick={() => { setEditingText(false); setTextError(''); }}>انصراف</button>
            <button type="button" className="ui-button ui-button-primary" disabled={textSaving} onClick={() => void saveText()}>{textSaving ? 'در حال ذخیره…' : 'ذخیرهٔ متن'}</button>
          </div>
        </div>}

        {!editingText && payload.mode === 'text' && <RichTextContent html={displayTextHtml} emptyText="متنی برای نمایش ثبت نشده است." className="mx-auto max-w-4xl text-sm leading-8" />}
        {payload.mode === 'image' && <img src={payload.src} alt={view.title} className="mx-auto max-h-[55dvh] w-auto rounded-2xl border border-slate-200 object-contain" />}
        {payload.mode === 'media' && (payload.media === 'audio'
          ? <audio src={payload.src} controls className="w-full" />
          : <video src={payload.src} controls className="mx-auto max-h-[55dvh] w-full rounded-2xl border border-slate-200" />)}
        {payload.mode === 'document' && <iframe src={payload.src} title={view.title} className="h-[55dvh] w-full rounded-2xl border border-slate-200" />}
        {payload.mode === 'link' && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" dir="ltr"><p className="break-all font-mono text-[11px] text-slate-600">{payload.url}</p></div>}
        {payload.mode === 'unsupported' && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-6">{payload.reason}</p></div>}
        {payload.mode === 'empty' && <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">برای این مورد فایل یا متنی ثبت نشده است؛ فقط توضیحات ورودی/خروجی موجود است.</p>}

        {viewTable && <section aria-label="ردیف جدول اطلاعات این خروجی" className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-black text-slate-700">این مورد ردیفی از «جدول اطلاعات» است</h4>
            <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{viewTable.name || `جدول شمارهٔ ${viewTable.id.toLocaleString('fa-IR')}`}</span>
          </header>
          {canLoadAsset && tableRows.isLoading && (viewTable.rowIds || []).length > 0 && <p className="mb-2 text-[11px] font-bold text-sky-700">در حال خواندن اطلاعات ردیف از خود جدول…</p>}
          {canLoadAsset && tableRows.isError && <p role="alert" className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-bold text-amber-800">خواندن زندهٔ این ردیف ممکن نشد: {parseApiError(tableRows.error).message}</p>}
          {tableRowList.length > 0 && <div className="space-y-3">
            {tableRowList.map(row => {
              const fields = dataTableRowFields(row.cells, tableRows.data?.columns || []);
              return <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
                  <span>ردیف شمارهٔ {row.id.toLocaleString('fa-IR')}</span>
                  <span>دادهٔ زندهٔ همین لحظه از جدول</span>
                </div>
                {fields.length
                  ? <dl className="grid gap-2 sm:grid-cols-2">{fields.map(field => <div key={field.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <dt className="text-[10px] font-bold text-slate-500">{field.name}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-6 text-slate-700">{field.value}</dd>
                  </div>)}</dl>
                  : <p className="text-[11px] text-slate-400">همهٔ ستون‌های این ردیف خالی‌اند.</p>}
              </article>;
            })}
          </div>}
          {tableRowList.length === 0 && !tableRows.isLoading && (viewTable.rowLabels?.length
            ? <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-500">برچسب ردیف‌ها در لحظهٔ تحویل ثبت شده است:</p>
              {viewTable.rowLabels.map((label, index) => <p key={`${index}-${label}`} className="rounded-lg bg-white px-2.5 py-2 text-[11px] leading-6 text-slate-700">{label}</p>)}
            </div>
            : <p className="rounded-xl border border-dashed border-sky-200 bg-white p-3 text-[11px] leading-6 text-slate-500">شناسهٔ ردیف‌های این خروجی ثبت نشده است؛ با دکمهٔ «نمایش در جدول اطلاعات» خودِ جدول را باز کنید و ردیف را همان‌جا ببینید.</p>)}
        </section>}

        {view.description && payload.mode !== 'text' && <section className="mt-4">
          <h4 className="mb-2 text-[11px] font-black text-slate-700">توضیحات و گزارش</h4>
          <p className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-7 text-slate-600">{view.description}</p>
        </section>}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
        {viewTable && onOpenDataTable && <button type="button" onClick={() => { onOpenDataTable(viewTable.id); onClose(); }} className="ui-button ui-button-primary"><TableProperties className="h-4 w-4" />نمایش در جدول اطلاعات</button>}
        {assetId && onOpenInDam && <button type="button" onClick={() => { onOpenInDam(assetId); onClose(); }} className="ui-button ui-button-secondary"><FolderKanban className="h-4 w-4" />نمایش در مخزن</button>}
        {downloadUrl && <a href={downloadUrl} className="ui-button ui-button-secondary" download><Download className="h-4 w-4" />دانلود فایل</a>}
        {payload.mode === 'link' && <a href={payload.url} target="_blank" rel="noopener noreferrer" className="ui-button ui-button-primary"><ExternalLink className="h-4 w-4" />بازکردن پیوند</a>}
        <button type="button" onClick={onClose} className="ui-button ui-button-ghost">بستن</button>
      </footer>
    </div>}
  </Modal>;
}

