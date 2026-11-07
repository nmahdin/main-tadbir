import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ExternalLink,
  FileArchive,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FileType,
  Image as ImageIcon,
  Link2,
  ListChecks,
  LoaderCircle,
  Music,
  Presentation,
  Table2,
  Video,
} from 'lucide-react';
import { request } from '../../api/client';
import { parseApiError } from '../../api/errors';
import { damApi } from '../../api/dam';
import { apiResourceUrl } from '../../utils/mediaUrl';
import { dataTableIdFromOutputValue, dataTableRowFields } from '../../utils/dataTableRows';
import { formatPersianDate } from '../../utils/date';
import { OUTPUT_KIND_LABELS, outputFormatBadge, outputVisualKind, type OutputVisualKind } from '../../utils/outputFiles';
import { ImagePreview } from '../common/ImagePreview';

/**
 * یک خروجیِ مرحله در پنجرهٔ «نمایش خروجی» مرکز بررسی و تأیید.
 *
 * قاعدهٔ این پنجره (دور ۸۹): داور باید همان چیزی را ببیند که دارد تأیید می‌کند —
 * تصویر باید خودش لود شود و اطلاعات «جدول اطلاعات» باید همان‌جا خوانده شود، نه
 * اینکه فقط یک دکمهٔ «مشاهده» گذاشته شود. در عین حال تا پنجره باز نشود هیچ
 * درخواستی فرستاده نمی‌شود (قاعدهٔ دور ۸۲): این کامپوننت فقط داخل مدال رندر
 * می‌شود و پرس‌وجوهایش هم وابسته به همان رندر هستند.
 */
const OUTPUT_VISUALS: Record<OutputVisualKind, { icon: typeof FileText; tone: string }> = {
  image: { icon: ImageIcon, tone: 'border-sky-100 bg-sky-50 text-sky-600' },
  video: { icon: Video, tone: 'border-violet-100 bg-violet-50 text-violet-600' },
  audio: { icon: Music, tone: 'border-fuchsia-100 bg-fuchsia-50 text-fuchsia-600' },
  pdf: { icon: FileText, tone: 'border-rose-100 bg-rose-50 text-rose-600' },
  word: { icon: FileType, tone: 'border-blue-100 bg-blue-50 text-blue-600' },
  excel: { icon: FileSpreadsheet, tone: 'border-emerald-100 bg-emerald-50 text-emerald-600' },
  powerpoint: { icon: Presentation, tone: 'border-orange-100 bg-orange-50 text-orange-600' },
  archive: { icon: FileArchive, tone: 'border-amber-100 bg-amber-50 text-amber-600' },
  text: { icon: FileText, tone: 'border-indigo-100 bg-indigo-50 text-indigo-600' },
  table: { icon: Table2, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
  link: { icon: Link2, tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  file: { icon: FileCheck, tone: 'border-indigo-100 bg-indigo-50 text-indigo-600' },
};

/** برچسب خوانای نسبتِ هر خروجی با مرحلهٔ در حال بررسی. */
export const OUTPUT_RELATIONS: Record<string, string> = {
  current: 'همین مرحله',
  forwarded: 'ارجاع‌شده به این مرحله',
};

type TableRef = { id: number; name?: string; rowIds: number[]; rowLabels?: string[] };

/** اگر خروجی ردیفی از «جدول اطلاعات» باشد، جدول و ردیف‌های همان خروجی. */
export const outputTableRef = (output: any): TableRef | undefined => {
  const rowIds = (Array.isArray(output?.rowIds) ? output.rowIds : [])
    .map((id: unknown) => Number(id))
    .filter((id: number) => Number.isFinite(id) && id > 0);
  const structured = Number(output?.dataTableId);
  if (Number.isFinite(structured) && structured > 0) {
    return { id: structured, name: output?.dataTableName, rowIds, rowLabels: output?.rowLabels };
  }
  const legacy = dataTableIdFromOutputValue(output?.value);
  return legacy ? { id: legacy, rowIds: [], rowLabels: [] } : undefined;
};

/** نشانی تصویرِ خروجی: برای دارایی مخزن، بندانگشتی سبک؛ وگرنه نشانی ثبت‌شده. */
export const outputImageSrc = (output: any): string => {
  const assetId = String(output?.assetId ?? '');
  if (/^\d+$/.test(assetId)) return damApi.library.thumbnailUrl(assetId, 640);
  return apiResourceUrl(output?.url);
};

type ApprovalOutputCardProps = {
  output: any;
  /** آیا کاربر مجوز دیدن فایل/جدول مخزن را دارد؟ بدون آن هیچ درخواستی نمی‌رود. */
  canPreview: boolean;
  fallbackStageTitle?: string;
};

export const ApprovalOutputCard: React.FC<ApprovalOutputCardProps> = ({ output, canPreview, fallbackStageTitle }) => {
  const kind = outputVisualKind(output);
  const visual = OUTPUT_VISUALS[kind];
  const TypeIcon = visual.icon;
  const table = outputTableRef(output);
  const imageSrc = outputImageSrc(output);
  const fileLink = apiResourceUrl(output?.url) || null;
  const relation = String(output?.relation || 'current');
  const relationLabel = OUTPUT_RELATIONS[relation] || '';
  const stageTitle = output?.stageTitle || fallbackStageTitle;
  const title = output?.name || output?.title || output?.fileName || 'خروجی مرحله';

  const tableQuery = useQuery({
    queryKey: ['approvals', 'data-table', table?.id, (table?.rowIds || []).join(',')],
    queryFn: () => request<{ data: { columns?: { id: string; name?: string }[]; rows?: { id: number; cells?: Record<string, string> }[]; pinned_rows?: { id: number; cells?: Record<string, string> }[] } }>(
      `/dam/data-tables/${table!.id}?per_page=5${(table!.rowIds || []).map(id => `&row_ids[]=${id}`).join('')}`,
    ).then(response => response.data),
    enabled: kind === 'table' && Boolean(table) && canPreview,
    staleTime: 30_000,
    retry: false,
  });

  const tableRows = tableQuery.data?.pinned_rows?.length ? tableQuery.data.pinned_rows : (tableQuery.data?.rows || []);
  const tableColumns = tableQuery.data?.columns || [];
  const recordedLabels = Array.isArray(output?.rowLabels) ? output.rowLabels : [];

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${visual.tone}`} title={OUTPUT_KIND_LABELS[kind]}>
          <TypeIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="break-words text-xs font-black text-slate-800">{title}</p>
            <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-600 ring-1 ring-slate-200">{outputFormatBadge(output)}</span>
            <span className="text-[9px] font-bold text-slate-500">{OUTPUT_KIND_LABELS[kind]}</span>
            {output?.fileSize && <span className="text-[9px] font-bold text-slate-500">{output.fileSize}</span>}
          </div>
          {(stageTitle || relationLabel) && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-500">
              {stageTitle && <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" />مرحلهٔ «{stageTitle}»</span>}
              {relationLabel && <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-slate-600">{relationLabel}</span>}
            </p>
          )}

          {kind === 'image' && canPreview && imageSrc && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {/* تصویر همان‌جا لود می‌شود؛ بندانگشتی سبک تا مصرف داده کم بماند. */}
              <ImagePreview src={imageSrc} alt={title} heightClass="h-56" className="w-full" errorText="پیش‌نمایش این تصویر در دسترس نیست." />
            </div>
          )}

          {kind === 'table' && (
            <section className="mt-2 rounded-xl border border-sky-200 bg-sky-50/60 p-2.5" aria-label="اطلاعات جدول این خروجی">
              <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-black text-sky-900">{table?.name || (table ? `جدول شمارهٔ ${table.id.toLocaleString('fa-IR')}` : 'جدول اطلاعات')}</span>
                <span className="rounded-lg bg-white px-2 py-0.5 text-[9px] font-bold text-slate-600">
                  {(table?.rowIds?.length || tableRows.length || recordedLabels.length).toLocaleString('fa-IR')} ردیف
                </span>
              </header>
              {canPreview && tableQuery.isPending && (
                <p role="status" className="flex items-center gap-2 text-[10px] font-bold text-sky-700">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />در حال خواندن اطلاعات جدول…
                </p>
              )}
              {canPreview && tableQuery.isError && (
                <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-800">
                  خواندن زندهٔ جدول ممکن نشد: {parseApiError(tableQuery.error).message}
                </p>
              )}
              {canPreview && tableRows.length > 0 && (
                <div className="space-y-2">
                  {tableRows.map(row => {
                    const fields = dataTableRowFields(row.cells, tableColumns);
                    return (
                      <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-2">
                        <p className="mb-1 text-[9px] font-bold text-slate-400">ردیف {row.id.toLocaleString('fa-IR')}</p>
                        {fields.length ? (
                          <dl className="grid gap-1.5 sm:grid-cols-2">
                            {fields.slice(0, 6).map(field => (
                              <div key={field.id} className="rounded-md bg-slate-50 px-2 py-1">
                                <dt className="text-[9px] font-bold text-slate-500">{field.name}</dt>
                                <dd className="mt-0.5 whitespace-pre-wrap break-words text-[10px] leading-5 text-slate-700">{field.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : <p className="text-[10px] text-slate-400">همهٔ ستون‌های این ردیف خالی‌اند.</p>}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* بدون دسترسی یا بدون شناسهٔ ردیف، همان برچسب‌های ثبت‌شده نمایش داده می‌شود. */}
              {(!canPreview || (tableRows.length === 0 && !tableQuery.isPending && !tableQuery.isError)) && recordedLabels.length > 0 && (
                <div className="space-y-1">
                  {recordedLabels.slice(0, 4).map((label: string, index: number) => (
                    <p key={`${index}-${label}`} className="rounded-md bg-white px-2 py-1 text-[10px] leading-5 text-slate-700">{label}</p>
                  ))}
                </div>
              )}
              {(!canPreview || (tableRows.length === 0 && !tableQuery.isPending && !tableQuery.isError)) && recordedLabels.length === 0 && !canPreview && (
                <p className="text-[10px] leading-5 text-slate-500">برای خواندن ردیف‌های این جدول به مجوز دیدن فایل‌های مخزن نیاز است.</p>
              )}
            </section>
          )}

          {kind === 'text' && output?.value && <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-6 text-slate-600">{output.value}</p>}
          {kind !== 'text' && kind !== 'image' && kind !== 'table' && output?.value && (
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-6 text-slate-600">{output.value}</p>
          )}

          {(fileLink || output?.deliveredAt) && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {fileLink && (
                <a href={fileLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                  <ExternalLink className="h-3.5 w-3.5" />بازکردن خروجی
                </a>
              )}
              {output?.deliveredAt && <span className="text-[10px] font-bold text-slate-500">تحویل: {formatPersianDate(output.deliveredAt)}</span>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default ApprovalOutputCard;
