import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown, Download, ExternalLink, Eye, FileArchive, FileCheck, FileSpreadsheet, FileText, FileType, FolderKanban, Image as ImageIcon,
  Link2, LoaderCircle, Music, Paperclip, Pencil, Presentation, Send, ShieldAlert, TableProperties, Video,
} from 'lucide-react';
import { Button, Modal } from '../common/Primitives';
import { RichTextContent, RichTextEditor, hasRichTextContent, richTextToPlainText, sanitizeRichTextHtml } from '../common/RichTextEditor';
import { apiConfig, request } from '../../api/client';
import { damApi } from '../../api/dam';
import { TextAssetActions } from '../common/TextAssetActions';
import { ImagePreview } from '../common/ImagePreview';
import { MediaPlayer } from '../common/MediaPlayer';
import { useDamAssetDetail, type DamAssetDetail } from '../../hooks/useDamAssetDetail';
import { downloadTextAsset } from '../../utils/textAssetDownload';
import { ApiError, apiErrorMessage, parseApiError } from '../../api/errors';
import { resourceUrl } from '../../utils/resourceUrl';
import { apiResourceUrl } from '../../utils/mediaUrl';
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
  /** قالب اعلام‌شدهٔ خود خروجی (`image`، `text`، `file`، …) در جریان محتوا. */
  outputType?: ContentStageOutput['type'];
  /** نوع MIME فایل، وقتی خودِ خروجی آن را ثبت کرده است. */
  mimeType?: string;
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
  outputType: output.type,
  mimeType: output.fileType,
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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)(?:$|\?)/i;

const isImageView = (view: StageAssetView): boolean => {
  // اول قالب اعلام‌شده و نوع MIME؛ چون خروجی‌های مخزن آدرس `…/preview` دارند و
  // پسوند فایل در آدرس دیده نمی‌شود، تشخیص فقط با پسوند، تصویر را از دست می‌داد.
  if (view.outputType === 'image') return true;
  if ((view.mimeType || '').toLowerCase().startsWith('image/')) return true;
  const name = `${view.fileName || ''} ${view.url || ''}`.toLowerCase();
  if (IMAGE_EXT.test(name)) return true;
  if (view.assetId && view.fileName && IMAGE_EXT.test(view.fileName)) return true;
  return false;
};

/** برچسب کوتاه نوع خروجی برای نشان روی کارت. */
const EXT_LABEL: Record<string, string> = {
  pdf: 'PDF', doc: 'Word', docx: 'Word', rtf: 'RTF', odt: 'ODT',
  xls: 'Excel', xlsx: 'Excel', csv: 'CSV', ods: 'ODS',
  ppt: 'PowerPoint', pptx: 'PowerPoint', odp: 'PowerPoint',
  txt: 'TXT', md: 'Markdown', json: 'JSON', xml: 'XML', zip: 'ZIP', rar: 'RAR', '7z': '7Z',
  png: 'PNG', jpg: 'JPG', jpeg: 'JPG', gif: 'GIF', webp: 'WebP', avif: 'AVIF', bmp: 'BMP', svg: 'SVG',
  mp3: 'MP3', wav: 'WAV', m4a: 'M4A', ogg: 'OGG', aac: 'AAC',
  mp4: 'MP4', mov: 'MOV', webm: 'WebM', mkv: 'MKV', avi: 'AVI',
};

const extensionOf = (view: StageAssetView): string => {
  const name = `${view.fileName || ''} ${view.url || ''}`.split('?')[0] || '';
  const match = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : '';
};

/**
 * نوع خروجی، همان‌طور که در کارت خوانده می‌شود: متن، پیوند، جدول یا فرمت فایل.
 *
 * قبلاً روی کارت هیچ نشانی از نوع خروجی نبود و کاربر فقط از آیکون کلی حدس
 * می‌زد؛ حالا برای فایل، فرمت واقعی (PDF، Word، MP4…) و برای متن، «متن» نوشته
 * می‌شود.
 */
export const stageAssetTypeLabel = (view: StageAssetView, meta?: {
  /** پسوند واقعی فایل از دارایی مخزن، وقتی خودِ ردیف خروجی آن را ندارد. */
  extension?: string;
  /** نوع MIME واقعی فایل از دارایی مخزن. */
  mimeType?: string;
  /** دارایی متنی مخزن (بدنه دارد و فایل نیست). */
  isTextAsset?: boolean;
}): string => {
  if (view.dataTable) return 'جدول اطلاعات';
  // نوع خروجی همیشه فرمت واقعی فایل را می‌نویسد؛ اگر ردیف خروجی پسوند/MIME
  // نداشته باشد (خروجی‌های بارگذاری‌شده از بله یا فرم)، از خود دارایی مخزن
  // خوانده می‌شود تا برچسب به «فایل» بی‌فرمت خلاصه نشود.
  const mime = (view.mimeType || meta?.mimeType || '').toLowerCase();
  const ext = extensionOf(view) || (meta?.extension || '').toLowerCase();
  if (isImageView(view)) {
    const label = EXT_LABEL[ext] || (mime.includes('svg') ? 'SVG' : mime.replace('image/', '').toUpperCase());
    return label ? `تصویر ${label}` : 'تصویر';
  }
  // خروجی متنی همان‌جا «متن» است، حتی اگر در مخزن به‌صورت دارایی ذخیره شده باشد.
  if (view.outputType === 'text' || meta?.isTextAsset) return 'متن';
  if (mime.startsWith('audio/')) return `صدا ${EXT_LABEL[ext] || ext.toUpperCase()}`.trim();
  if (mime.startsWith('video/')) return `ویدیو ${EXT_LABEL[ext] || ext.toUpperCase()}`.trim();
  const kind = fileKindOf(view);
  if (kind === 'text') return 'متن';
  if (kind === 'link' && !ext) return 'پیوند';
  if (ext) return `فایل ${EXT_LABEL[ext] || ext.toUpperCase()}`;
  if (mime.includes('pdf')) return 'فایل PDF';
  if (mime.includes('word')) return 'فایل Word';
  if (mime.includes('sheet') || mime.includes('excel')) return 'فایل Excel';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'فایل PowerPoint';
  if (mime.startsWith('text/')) return 'فایل متنی';
  // دور ۸۵: برچسب «فایل»ِ بی‌فرمت نماند؛ اگر فقط MIME داریم، زیرنوع آن را
  // نشان می‌دهیم (مثلاً application/zip → «فایل ZIP»).
  const subtype = mime.split('/')[1]?.split(';')[0]?.trim();
  if (subtype) {
    const known = EXT_LABEL[subtype];
    if (known) return `فایل ${known}`;
    if (subtype.includes('zip') || subtype.includes('rar') || subtype.includes('compressed')) return 'فایل ZIP';
    if (/^[a-z0-9.+-]{2,12}$/.test(subtype)) return `فایل ${subtype.toUpperCase()}`;
  }
  return 'فایل';
};

const textExcerpt = (view: StageAssetView): string => {
  const raw = String(view.value ?? view.description ?? '').trim();
  if (!raw) return '';
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
};

/**
 * آیکون و رنگ مناسبِ هر نوع خروجی.
 *
 * پیش‌تر همهٔ کارت‌ها یک آیکون یکسان داشتند و کاربر فقط با خواندن برچسب نوع
 * می‌فهمید خروجی عکس است یا PDF. حالا شکل آیکون خودش نوع را می‌گوید: تصویر،
 * ویدیو، صدا، PDF، Word، Excel، PowerPoint، فایل فشرده، متن، پیوند یا جدول.
 * تشخیص از MIME/قالب خود ردیف خروجی است و هیچ درخواست شبکه‌ای لازم ندارد.
 */
export type StageAssetVisualKind = 'image' | 'video' | 'audio' | 'pdf' | 'word' | 'excel' | 'powerpoint' | 'archive' | 'text' | 'table' | 'link' | 'file';

export const stageAssetVisualKind = (view: StageAssetView): StageAssetVisualKind => {
  if (view.dataTable) return 'table';
  const mime = (view.mimeType || '').toLowerCase();
  const name = `${view.fileName || ''} ${view.url || ''}`.toLowerCase();
  const ext = extensionOf(view);
  if (isImageView(view)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v|mpeg|mpg)(?:$|\?)/.test(name)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|oga|aac|flac|opus)(?:$|\?)/.test(name)) return 'audio';
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (mime.includes('word') || ['doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'word';
  if (mime.includes('sheet') || mime.includes('excel') || ['xls', 'xlsx', 'ods'].includes(ext)) return 'excel';
  if (mime.includes('presentation') || mime.includes('powerpoint') || ['ppt', 'pptx', 'odp'].includes(ext)) return 'powerpoint';
  if (/(zip|rar|7z|gzip|tar)/.test(mime) || ['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) return 'archive';
  if (view.outputType === 'text' || mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'csv', 'log'].includes(ext)) return 'text';
  const kind = fileKindOf(view);
  if (kind === 'text') return 'text';
  if (kind === 'link') return 'link';
  return 'file';
};

const VISUAL_ICONS: Record<StageAssetVisualKind, { icon: typeof FileText; tone: string }> = {
  image: { icon: ImageIcon, tone: 'border-sky-100 bg-sky-50 text-sky-600' },
  video: { icon: Video, tone: 'border-violet-100 bg-violet-50 text-violet-600' },
  audio: { icon: Music, tone: 'border-fuchsia-100 bg-fuchsia-50 text-fuchsia-600' },
  pdf: { icon: FileText, tone: 'border-rose-100 bg-rose-50 text-rose-600' },
  word: { icon: FileType, tone: 'border-blue-100 bg-blue-50 text-blue-600' },
  excel: { icon: FileSpreadsheet, tone: 'border-emerald-100 bg-emerald-50 text-emerald-600' },
  powerpoint: { icon: Presentation, tone: 'border-orange-100 bg-orange-50 text-orange-600' },
  archive: { icon: FileArchive, tone: 'border-amber-100 bg-amber-50 text-amber-600' },
  text: { icon: FileText, tone: 'border-indigo-100 bg-indigo-50 text-indigo-600' },
  table: { icon: TableProperties, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
  link: { icon: Link2, tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  file: { icon: FileCheck, tone: 'border-indigo-100 bg-indigo-50 text-indigo-600' },
};

/** آیکون همان نوع خروجی، برای استفاده در کارت و مدال پیش‌نمایش. */
export const stageAssetIcon = (view: StageAssetView) => VISUAL_ICONS[stageAssetVisualKind(view)];

/**
 * کارت یک ورودی یا خروجی؛ ظاهر و رفتار هر دو یکسان است.
 *
 * سیاست مصرف اینترنت (دور ۸۲): کارت **هیچ چیزی دانلود نمی‌کند**.
 * پیش‌تر کارت خروجیِ تصویری، بندانگشتی تصویر را می‌گرفت و برای فهمیدن نوع و
 * متن، جزئیات دارایی را هم می‌خواند؛ در یک مرحله با ده‌ها خروجی، همین باعث
 * مصرف سنگین داده می‌شد — به‌ویژه روی موبایل. حالا کارت فقط با همان اطلاعات
 * سبکِ خودِ ردیف خروجی (عنوان، قالب، نام فایل و متن ثبت‌شده) ساخته می‌شود،
 * آیکون نوعِ فایل را نشان می‌دهد و تصویر/متن/فایل تنها زمانی دانلود می‌شود که
 * کاربر مدال «پیش‌نمایش» را باز کند.
 */
export function StageAssetCard({ view, onPreview, actions }: {
  view: StageAssetView;
  onPreview: (view: StageAssetView) => void;
  actions?: React.ReactNode;
  key?: React.Key;
}) {
  const visual = stageAssetIcon(view);
  const Icon = visual.icon;
  /** متن کوتاه فقط از خودِ ردیف خروجی؛ هیچ درخواستی برای متنِ دارایی نمی‌رود. */
  const excerpt = textExcerpt(view);
  /** نوع خروجی روی کارت: فرمت واقعی فایل یا «متن»/«پیوند»/«جدول اطلاعات». */
  const typeLabel = stageAssetTypeLabel(view);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-colors hover:border-indigo-200 hover:shadow-sm">
      <button
        type="button"
        onClick={() => onPreview(view)}
        className="flex flex-1 flex-col gap-2 p-3 text-right"
      >
        <span className="flex w-full items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${visual.tone}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="break-words text-[12px] font-black leading-5 text-slate-900">{view.title}</span>
          </span>
          {/* نوع خروجی: برای فایل، فرمت واقعی و برای متن، «متن». */}
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black text-slate-600" title="نوع خروجی">
            {typeLabel}
          </span>
        </span>
        {view.dataTable && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5 rounded-xl bg-sky-50 px-2.5 py-1.5 text-[10px] font-bold text-sky-700">
            <TableProperties className="h-3.5 w-3.5" aria-hidden />
            <span>{view.dataTable.name ? `جدول: ${view.dataTable.name}` : `جدول شماره ${view.dataTable.id.toLocaleString('fa-IR')}`}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[9px]">{(view.dataTable.rowIds?.length || 0).toLocaleString('fa-IR')} ردیف</span>
          </span>
        )}
        {!view.dataTable && excerpt ? (
          <span className="mt-1 line-clamp-3 block whitespace-pre-wrap rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] leading-6 text-slate-700">{excerpt}</span>
        ) : !view.dataTable && view.description ? (
          <span className="mt-1 line-clamp-2 block whitespace-pre-wrap text-[10px] leading-5 text-slate-500">{view.description}</span>
        ) : !view.dataTable ? (
          // جای خالی ثابت تا ارتفاع کارت‌ها با هم هم‌تراز بماند.
          <span aria-hidden className="mt-1 block h-6" />
        ) : null}
        {view.dataTable && view.dataTable.rowLabels && view.dataTable.rowLabels.length > 0 && (
          <span className="mt-1 line-clamp-2 block whitespace-pre-wrap rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] leading-5 text-slate-600">{view.dataTable.rowLabels.slice(0, 2).join(' · ')}{view.dataTable.rowLabels.length > 2 ? '…' : ''}</span>
        )}
      </button>
      <footer className="flex items-center justify-end gap-1 border-t border-slate-100 bg-slate-50/60 px-3 py-1.5">
        {/* دکمهٔ پیش‌نمایش با همان دکمهٔ استاندارد سامانه (دور ۸۵) تا با
            «نیازمند اصلاح»/«تأیید» و بقیهٔ دکمه‌ها یک‌شکل باشد. */}
        <Button variant="secondary" onClick={() => onPreview(view)} title="پیش‌نمایش این خروجی"><Eye className="h-4 w-4" aria-hidden />پیش‌نمایش</Button>
        {actions}
      </footer>
    </article>
  );
}

/* ── باز/بسته بودن بخش‌های ورودی ──
   ورودی‌ها پیش‌فرض بسته‌اند تا کارت مرحله‌ها جمع‌وجور بمانند. خروجی‌ها همیشه باز
   هستند و جمع نمی‌شوند. انتخاب کاربر برای ورودی فقط در همین نشست (in-memory)
   به یاد می‌ماند و با بارگذاری دوبارهٔ صفحه به حالت پیش‌فرض برمی‌گردد؛ هیچ چیزی
   در مرورگر ذخیره نمی‌شود. */
const SECTION_STATE: Partial<Record<StageAssetKind, boolean>> = {};

const readSectionState = (kind: StageAssetKind): boolean | undefined => SECTION_STATE[kind];

const writeSectionState = (kind: StageAssetKind, open: boolean) => {
  SECTION_STATE[kind] = open;
};

/**
 * بخش ورودی‌ها یا خروجی‌های یک مرحله.
 * - ورودی‌ها: فقط وقتی ورودی ثبت شده باشد نمایش داده می‌شوند و باز/بسته می‌شوند.
 * - خروجی‌ها: همیشه باز هستند و قابل جمع‌شدن نیستند.
 */
export function StageAssetSection({
  kind, items, title, action, emptyTitle, emptyHint, pendingTitles, onPreview, renderActions, defaultOpen,
}: {
  kind: StageAssetKind;
  items: StageAssetView[];
  title: string;
  action?: React.ReactNode;
  emptyTitle: string;
  emptyHint: string;
  pendingTitles?: string[];
  onPreview: (view: StageAssetView) => void;
  renderActions?: (view: StageAssetView) => React.ReactNode;
  /** وضعیت اولیه برای ورودی‌ها؛ خروجی‌ها همیشه باز هستند. */
  defaultOpen?: boolean;
}) {
  /**
   * هوک‌ها پیش از هر بازگشت شرطی می‌آیند. تعریف `useId`/`useState` بعد از
   * `return null` باعث می‌شد با رسیدن نخستین ورودیِ یک مرحله، تعداد هوک‌ها بین
   * دو رندر عوض شود و React خطای #310 («هوک بیشتر از رندر قبل») بدهد؛ همان
   * خطای غیرمنتظره‌ای که صفحهٔ محتوا را می‌انداخت.
   */
  const bodyId = React.useId();
  const isOutput = kind === 'output';
  const [open, setOpen] = React.useState(() => isOutput ? true : (readSectionState(kind) ?? defaultOpen ?? false));

  // ورودی‌ها وقتی هیچ موردی ندارند پنهان می‌شوند.
  if (kind === 'input' && items.length === 0) return null;

  const accent = kind === 'input' ? 'border-sky-100 bg-sky-50/45' : 'border-indigo-100 bg-indigo-50/45';
  const iconTone = kind === 'input' ? 'text-sky-600 border-sky-100' : 'text-indigo-600 border-indigo-100';
  const countTone = kind === 'input' ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700';
  const borderTone = kind === 'input' ? 'border-sky-100' : 'border-indigo-100';
  const pendingCount = pendingTitles?.length || 0;

  // خروجی‌ها همیشه باز هستند.
  const toggle = () => {
    if (isOutput) return;
    setOpen(current => {
      const next = !current;
      writeSectionState(kind, next);
      return next;
    });
  };

  return (
    <section className={`overflow-hidden rounded-2xl border ${accent}`}>
      <header className={`flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${open ? `border-b ${borderTone}` : ''}`}>
        {isOutput ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-right">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-2xs ${iconTone}`}>
              <FileCheck className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black text-slate-800">{title}</h4>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black leading-none ${countTone}`}>{items.length.toLocaleString('fa-IR')} مورد</span>
                {pendingCount > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600" title={pendingTitles?.join('، ')}>{pendingCount.toLocaleString('fa-IR')} پیش‌نویس/پیش‌بینی‌شده</span>}
              </span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            title={open ? 'بستن این بخش' : 'باز کردن این بخش'}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-right transition-colors hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-2xs ${iconTone}`}>
              <Paperclip className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black text-slate-800">{title}</h4>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black leading-none ${countTone}`}>{items.length.toLocaleString('fa-IR')} مورد</span>
                {pendingCount > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600" title={pendingTitles?.join('، ')}>{pendingCount.toLocaleString('fa-IR')} پیش‌نویس/پیش‌بینی‌شده</span>}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </button>
        )}
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{action}</div>}
      </header>
      <div id={bodyId} className={isOutput ? '' : `grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className={isOutput ? '' : 'overflow-hidden'} inert={!open ? true : undefined}>
          <div className="p-3 sm:p-4">
            {items.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {items.map(view => <StageAssetCard key={view.id} view={view} onPreview={onPreview} actions={renderActions?.(view)} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-300 shadow-2xs">
                  <FileText className="h-5 w-5" />
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

type PreviewPayload =
  | { mode: 'loading' }
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
const escapeHtmlText = (value: unknown): string =>
  String(value ?? '').replace(/[<>&]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[character] as string));

/** پیش‌نمایش بدون مخزن: پیوند یا متن ثبت‌شده روی همان ورودی/خروجی. */
const inlinePayload = (view: StageAssetView): PreviewPayload => {
  if (view.url) {
    const resolved = apiResourceUrl(view.url) || resourceUrl(view.url);
    if (resolved) {
      return isImageView(view)
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

/**
 * اسکلت لودینگ پیش‌نمایش (متن/عکس/فایل).
 *
 * تا وقتی محتوای پیش‌نمایش نرسیده، جای آن با نوارهای درخشان و یک برچسب روشن
 * پرشده می‌شود؛ هم کاربر می‌فهمد در حال بارگذاری است و هم صفحه نمی‌لرزد.
 */
function PreviewSkeleton({ lines = 4, label = 'در حال دریافت پیش‌نمایش…', compact = false }: { lines?: number; label?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-2' : 'mb-3 space-y-2.5'} role="status" aria-live="polite" aria-label={label}>
      <p className="flex items-center gap-2 text-[11px] font-bold text-indigo-600">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {label}
      </p>
      {!compact && <div className="ui-skeleton h-5 w-2/3" aria-hidden />}
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className={compact ? 'ui-skeleton h-3' : 'ui-skeleton h-3.5'} style={{ width: `${92 - index * 9}%` }} aria-hidden />
      ))}
    </div>
  );
}

/** پردهٔ بارگذاری روی پیش‌نمایش تصویر/فایل، با اسکلت درخشان و برچسب. */
function PreviewLoading({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="ui-skeleton absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl text-center" role="status" aria-live="polite">
      <span className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        {label}
      </span>
      {hint && <span className="text-[10px] font-medium text-slate-400">{hint}</span>}
    </div>
  );
}

/** پیش‌نمایش درون‌صفحه‌ای ورودی/خروجی بدون خروج از صفحهٔ جزئیات محتوا. */
export function StageAssetPreviewModal({
  view, onClose, onOpenInDam, onOpenDataTable, onEditText, canLoadAsset = true, canEditTextAsset = false,
}: {
  view: StageAssetView | null;
  onClose: () => void;
  onOpenInDam?: (assetId: string) => void;
  onOpenDataTable?: (tableId: number) => void;
  /** ویرایش متن خروجی جریان؛ عنوان هم همراه متن ذخیره می‌شود. */
  onEditText?: (view: StageAssetView, plainText: string, title?: string) => Promise<void>;
  canLoadAsset?: boolean;
  canEditTextAsset?: boolean;
}) {
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  /** عنوان قابل ویرایش همان متن؛ پیش‌فرض عنوان فعلی خروجی یا دارایی است. */
  const [titleDraft, setTitleDraft] = useState('');
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [textNote, setTextNote] = useState('');
  const [textSaving, setTextSaving] = useState(false);
  const [textError, setTextError] = useState('');
  const [savedTextHtml, setSavedTextHtml] = useState<string | null>(null);
  const assetId = view?.assetId && /^\d+$/.test(view.assetId) ? view.assetId : undefined;
  const asset = useDamAssetDetail(assetId, canLoadAsset);
  const viewTable = view?.dataTable;
  const tableRows = useQuery({
    queryKey: ['dam-table', 'preview-rows', viewTable?.id, (viewTable?.rowIds || []).join(',')],
    queryFn: () => request<{ data: { columns?: PreviewTableColumn[]; pinned_rows?: PreviewTableRow[] } }>(
      `/dam/data-tables/${viewTable!.id}?per_page=20&${(viewTable.rowIds || []).map(id => `row_ids[]=${id}`).join('&')}`,
    ).then(response => response.data),
    enabled: Boolean(viewTable && canLoadAsset && (viewTable.rowIds || []).length > 0),
    staleTime: 30_000,
    retry: false,
  });
  const tableRowList = tableRows.data?.pinned_rows || [];
  /**
   * اول لودینگ، بعد تصویر/متن.
   *
   * پیش از این، تا رسیدن جزئیات دارایی همان «پیوند» یا آدرس خام نمایش داده
   * می‌شد و کاربر اول آدرس را می‌دید و بعد فایل لود می‌شد. حالا برای هر موردِ
   * مخزنی تا آمدن جزئیات فقط اسکلت لودینگ دیده می‌شود و پیوند/متن/تصویر بعد از
   * آن می‌آید؛ فقط در صورت خطا، همان دادهٔ سبکِ جریان نمایش داده می‌شود.
   */
  const waitingForAsset = Boolean(assetId && canLoadAsset && !asset.data && !asset.isError);
  const payload: PreviewPayload = view
    ? (asset.data
      ? assetPayload(asset.data)
      : assetId
        ? (waitingForAsset ? { mode: 'loading' } : inlinePayload(view))
        : inlinePayload(view))
    : { mode: 'empty' };
  const [downloading, setDownloading] = useState(false);
  // آماده‌شدن پیش‌نمایش‌های غیرمتنی (تصویر، صدا/ویدیو، PDF) تا جای «کادر خالی»
  // یک اسکلت/نشانگر لودینگ دیده شود.
  const [documentReady, setDocumentReady] = useState(false);
  const previewKey = view ? `${view.id}:${payload.mode}` : '';
  useEffect(() => { setDocumentReady(false); }, [previewKey]);
  const handleDownload = async () => {
    if (!assetId) return;
    setDownloading(true);
    try {
      const response = await fetch(`${apiConfig.baseUrl}/dam/library/${assetId}/download`, { credentials: 'include', headers: { Accept: 'application/octet-stream' } });
      if (!response.ok) throw new Error(`دانلود ناموفق بود (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = asset.data?.latest_file?.original_filename || view?.fileName || view?.title || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      // fallback to opening preview url if fetch fails (e.g., demo mode)
      const fallback = damApi.library.previewUrl(assetId);
      window.open(fallback, '_blank');
    } finally {
      setDownloading(false);
    }
  };
  const assetIsEditableText = Boolean(
    asset.data &&
    payload.mode === 'text' &&
    (asset.data.type === 'content' || Boolean(asset.data.content_item?.content_body))
  );
  const assetTextEditable = Boolean(assetId && canEditTextAsset && assetIsEditableText);
  /** عنوان فعلی: برای دارایی مخزن از خود دارایی، برای خروجی جریان از «عنوان خروجی». */
  const suggestedTitle = (asset.data?.title || view?.title || '').trim();
  const displayTitle = savedTitle || suggestedTitle;
  const flowTextEditable = Boolean(onEditText && view && view.kind === 'output' && !assetId);
  const textEditable = assetTextEditable || flowTextEditable;
  const displayTextHtml = savedTextHtml !== null ? savedTextHtml : (payload.mode === 'text' ? payload.html : '');

  const startTextEdit = () => {
    setTextError('');
    setTextNote('');
    setTitleDraft(suggestedTitle);
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
      // عنوان همان چیزی است که در فهرست خروجی‌ها و کارت مرحله خوانده می‌شود؛
      // خالی گذاشتنش عنوان قبلی را حفظ می‌کند.
      const trimmedTitle = titleDraft.trim().slice(0, 255);
      const titleChanged = Boolean(trimmedTitle && trimmedTitle !== suggestedTitle);
      if (trimmedTitle.length > 0 && trimmedTitle.length < 2) throw new Error('عنوان باید حداقل دو نویسه باشد.');
      if (assetTextEditable) {
        if (titleChanged) await damApi.library.updateTitle(assetId as string, trimmedTitle);
        await damApi.library.reviseText(assetId as string, clean, textNote.trim() || undefined);
        await asset.refetch();
        setSavedTextHtml(clean);
        if (titleChanged) setSavedTitle(trimmedTitle);
      } else if (flowTextEditable && onEditText) {
        const plain = richTextToPlainText(clean).trim();
        await onEditText(view, plain, titleChanged ? trimmedTitle : undefined);
        setSavedTextHtml(`<p>${escapeHtmlText(plain)}</p>`);
        if (titleChanged) setSavedTitle(trimmedTitle);
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

  React.useEffect(() => {
    setEditingText(false);
    setSavedTextHtml(null);
    setSavedTitle(null);
    setTextError('');
    setDocumentReady(false);
  }, [view?.id]);

  return <Modal
    open={Boolean(view)}
    onClose={onClose}
    title={displayTitle || 'پیش‌نمایش'}
    description={view?.contextLabel}
    // آیکون سربرگ مدال هم نوع همان خروجی را نشان می‌دهد (عکس، متن، PDF…).
    icon={view
      ? (() => { const ModalIcon = stageAssetIcon(view).icon; return <ModalIcon className="h-5 w-5" />; })()
      : <FileCheck className="h-5 w-5" />}
    size="xl"
    panelScroll={false}
  >
    {view && <div className="flex max-h-[calc(94dvh-82px)] min-h-[45dvh] flex-col">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold text-slate-600">
        <span className={`rounded-lg px-2 py-1 ${view.statusTone === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{view.statusLabel}</span>
        <span className="rounded-lg bg-white px-2 py-1" title="نوع خروجی">{stageAssetTypeLabel(view)}</span>
        {view.fileName && <span className="rounded-lg bg-white px-2 py-1"><Paperclip className="ml-1 inline h-3 w-3" />{view.fileName}</span>}
        {view.fileSize && <span className="rounded-lg bg-white px-2 py-1">{view.fileSize}</span>}
        {view.deliveredAt && <span className="rounded-lg bg-white px-2 py-1">تحویل: {view.deliveredAt}</span>}
        {view.forwardedToStageTitle && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700"><Send className="ml-1 inline h-3 w-3" />ارجاع به {view.forwardedToStageTitle}{view.forwardedAt ? ` · ${view.forwardedAt}` : ''}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {payload.mode === 'loading' && <PreviewSkeleton />}
        {asset.isError && <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-800">مشاهدهٔ فایل این مورد در مخزن ممکن نشد: {parseApiError(asset.error).message}</p>}

        {textEditable && !editingText && !viewTable && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          <span className="text-[10px] font-bold leading-5 text-indigo-700">{assetTextEditable ? 'ویرایش، نسخهٔ تازهٔ همین دارایی متنی را می‌سازد و متن قبلی در تاریخ نسخه‌ها می‌ماند.' : 'این متن بخشی از خروجی همین مرحله است و همان‌جا ذخیره می‌شود.'}</span>
          <button type="button" onClick={startTextEdit} className="ui-button ui-button-secondary !min-h-8 !rounded-xl !px-3 !py-1.5 text-[10px]"><Pencil className="h-3.5 w-3.5" />ویرایش متن</button>
        </div>}
        {editingText && !viewTable && <div className="mb-4 space-y-3 rounded-2xl border border-indigo-200 bg-white p-4">
          {textError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] font-bold text-rose-700">{textError}</p>}
          {/* عنوان متن خروجی همان‌جا قابل ویرایش است؛ نیازی به ترک مدال نیست. */}
          <label className="block space-y-1.5 text-[10px] font-bold text-slate-600">عنوان خروجی
            <input
              type="text"
              value={titleDraft}
              onChange={event => setTitleDraft(event.target.value)}
              maxLength={255}
              placeholder="عنوان این متن خروجی"
              aria-label="عنوان خروجی"
              className="ui-input mt-1.5 text-xs"
            />
            <span className="block text-[9px] font-medium text-slate-500">همین عنوان در فهرست خروجی‌های مرحله و در مخزن دیده می‌شود؛ خالی گذاشتن آن عنوان قبلی را نگه می‌دارد.</span>
          </label>
          <RichTextEditor value={textDraft} onChange={setTextDraft} label="متن خروجی" placeholder="متن خروجی را بنویسید…" minHeight={220} />
          {assetTextEditable && <input value={textNote} onChange={event => setTextNote(event.target.value)} placeholder="توضیح این تغییر (اختیاری)" aria-label="توضیح تغییر متن" className="ui-input text-[11px]" />}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="ui-button ui-button-secondary" disabled={textSaving} onClick={() => { setEditingText(false); setTextError(''); }}>انصراف</button>
            <button type="button" className="ui-button ui-button-primary" disabled={textSaving} onClick={() => void saveText()}>{textSaving ? 'در حال ذخیره…' : 'ذخیرهٔ متن'}</button>
          </div>
        </div>}

        {!editingText && payload.mode === 'text' && <RichTextContent html={displayTextHtml} emptyText="متنی برای نمایش ثبت نشده است." className="mx-auto max-w-4xl text-sm leading-8" />}
        {payload.mode === 'image' && (
          // تصویر با «اندازهٔ کامل» و بدون بریدن. لودینگ تصویر را خودِ
          // `ImagePreview` نشان می‌دهد؛ یک پردهٔ لودینگ اضافه روی آن فقط متن
          // تکراری «در حال لود تصویر…» می‌ساخت (دور ۷۷ حذف شد).
          <ImagePreview
            src={payload.src}
            alt={view.title}
            className="mx-auto w-full"
          />
        )}
        {payload.mode === 'media' && (
          // پخش‌کنندهٔ اختصاصی: بارگیری همراه با پخش و توقف بارگیری با توقف پخش.
          <MediaPlayer
            src={payload.src}
            kind={payload.media}
            title={view.title}
            footnote
          />
        )}
        {payload.mode === 'document' && (
          <div className="relative">
            {!documentReady && <PreviewLoading label="در حال لود فایل…" hint="پیش‌نمایش فایل پس از آماده‌شدن نمایش داده می‌شود." />}
            <iframe src={payload.src} title={view.title} onLoad={() => setDocumentReady(true)} className="h-[55dvh] w-full rounded-2xl border border-slate-200" />
          </div>
        )}
        {payload.mode === 'link' && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" dir="ltr"><p className="break-all font-mono text-[11px] text-slate-600">{payload.url}</p></div>}
        {payload.mode === 'unsupported' && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-6">{payload.reason}</p></div>}
        {payload.mode === 'empty' && !viewTable && <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">برای این مورد فایل یا متنی ثبت نشده است؛ فقط توضیحات ورودی/خروجی موجود است.</p>}

        {viewTable && <section aria-label="ردیف‌های جدول اطلاعات این خروجی" className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-black text-slate-700">
              {viewTable.rowIds.length > 1 ? `این خروجی شامل ${viewTable.rowIds.length.toLocaleString('fa-IR')} ردیف از «جدول اطلاعات» است` : 'این مورد ردیفی از «جدول اطلاعات» است'}
            </h4>
            <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{viewTable.name || `جدول شمارهٔ ${viewTable.id.toLocaleString('fa-IR')}`}</span>
          </header>
          {canLoadAsset && tableRows.isLoading && (
            // تا رسیدن ردیف‌ها، شکل خودِ جدول با اسکلت نگه داشته می‌شود تا نه
            // صفحه بپرد و نه کادر خالی دیده شود.
            <div className="mb-3 space-y-2" role="status" aria-live="polite" aria-label="در حال خواندن اطلاعات ردیف">
              <p className="flex items-center gap-2 text-[11px] font-bold text-sky-700">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                در حال خواندن اطلاعات ردیف از خود جدول…
              </p>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                {[0, 1, 2].map(index => (
                  <div key={index} className="ui-skeleton h-3.5" style={{ width: `${92 - index * 16}%` }} aria-hidden />
                ))}
              </div>
            </div>
          )}
          {canLoadAsset && tableRows.isError && <p role="alert" className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-bold text-amber-800">خواندن زندهٔ این ردیف ممکن نشد: {parseApiError(tableRows.error).message}</p>}
          {/* نمایش ردیف‌ها از «مات» به «شفاف» می‌آید تا اطلاعات ناگهانی ظاهر نشود. */}
          {tableRowList.length > 0 && <div className="ui-clear-in space-y-3">
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
            ? <div className="ui-clear-in space-y-2">
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
        {payload.mode === 'text' && !viewTable && (
          <TextAssetActions title={view.title} html={displayTextHtml || view.value || ''} onView={() => {}} canDownload showView={false} />
        )}
        {viewTable && onOpenDataTable && <button type="button" onClick={() => { onOpenDataTable(viewTable.id); onClose(); }} className="ui-button ui-button-primary"><TableProperties className="h-4 w-4" />نمایش در جدول اطلاعات</button>}
        {assetId && !viewTable && onOpenInDam && <button type="button" onClick={() => { onOpenInDam(assetId); onClose(); }} className="ui-button ui-button-secondary"><FolderKanban className="h-4 w-4" />نمایش در مخزن</button>}
        {assetId && !viewTable && canLoadAsset && payload.mode !== 'text' && <button type="button" onClick={() => void handleDownload()} disabled={downloading} className="ui-button ui-button-secondary"><Download className="h-4 w-4" />{downloading ? 'در حال دانلود…' : 'دانلود فایل'}</button>}
        {payload.mode === 'link' && <a href={payload.url} target="_blank" rel="noopener noreferrer" className="ui-button ui-button-primary"><ExternalLink className="h-4 w-4" />بازکردن پیوند</a>}
        <button type="button" onClick={onClose} className="ui-button ui-button-ghost">بستن</button>
      </footer>
    </div>}
  </Modal>;
}
