import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, File, FileText, LoaderCircle, Table2, Trash2 } from 'lucide-react';
import { apiConfig, request } from '../../api/client';
import { useApp } from '../../context/AppContext';
import type { MeetingAttachment } from '../../types';
import { DamAssetQuickPreview } from '../dam/DamAssetQuickPreview';
import { TextAssetActions } from '../common/TextAssetActions';

/**
 * ضمیمه‌های جلسه دقیقاً مثل پیوست‌های عمومی سامانه رفتار می‌کنند:
 * - دکمهٔ «پیش‌نمایش» همان پیش‌نمایش سریع مخزن را باز می‌کند (تصویر، صدا، ویدیو،
 *   PDF/متن ساده و دارایی متنی) و پیام‌های مجوز را هم همان‌جا نشان می‌دهد.
 * - دکمهٔ دانلود برای فایل‌ها یک لینک سادهٔ «دانلود فایل» است، اما برای
 *   دارایی‌های متنی فهرست قالب‌ها را باز می‌کند (متن ساده، Word، PDF) — همان
 *   `TextAssetActions`ی که در مخزن، تسک‌ها و محتوا استفاده می‌شود.
 */

type MeetingAttachmentAssetDetail = {
  id: number | string;
  type?: 'file' | 'content' | 'data_table';
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
  content_item?: { content_body?: string } | null;
};

/**
 * شناسهٔ دارایی مخزن برای پیوست جلسه.
 *
 * پیوست‌های تازه `assetId` را صریح ذخیره می‌کنند؛ برای رکوردهای قبلی که فقط
 * شناسهٔ `matt-<assetId>-<timestamp>-<index>` را دارند، همان شناسه بازیابی
 * می‌شود. شناسه‌های قدیمی‌تر (`matt-<timestamp>`) دارایی مخزن ندارند و نباید
 * عدد زمان را به‌جای شناسهٔ دارایی بگیرند.
 */
export function meetingAttachmentAssetId(attachment: MeetingAttachment): number | null {
  const stored = Number(attachment.assetId);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const parsed = /^matt-(\d+)-\d+(?:-\d+)?$/.exec(attachment.id);
  return parsed ? Number(parsed[1]) : null;
}

const KIND_LABEL: Record<string, string> = {
  content: 'دارایی متنی',
  file: 'فایل',
  data_table: 'جدول اطلاعات',
};

export function MeetingAttachmentRow({ attachment, onRemove, className = '' }: {
  /** این مخزن تایپ‌های React را از JS استنتاج می‌کند؛ کلید لیست باید صریح اعلام شود. */
  key?: string | number;
  attachment: MeetingAttachment;
  onRemove?: () => void;
  className?: string;
}) {
  const { hasPermission } = useApp();
  const [previewOpen, setPreviewOpen] = useState(false);
  const assetId = meetingAttachmentAssetId(attachment);

  // همان کلید کوئریِ پیش‌نمایش سریع؛ جزئیات دارایی یک‌بار گرفته و مشترک می‌شود.
  const detail = useQuery({
    queryKey: ['dam-asset', 'quick-preview', assetId],
    queryFn: () => request<{ data: MeetingAttachmentAssetDetail }>(`/dam/library/${assetId}`).then(response => response.data),
    enabled: Boolean(assetId),
    staleTime: 60_000,
    retry: false,
  });

  const assetType = attachment.assetType ?? detail.data?.type;
  const isText = assetType === 'content';
  const isTable = assetType === 'data_table';
  const textHtml = detail.data?.content_item?.content_body || '';
  const canDownload = hasPermission('assets.download');
  const canPreview = Boolean(assetId) && !isTable;
  const kindLabel = KIND_LABEL[assetType || ''] || 'پیوست';
  const Icon = isText ? FileText : isTable ? Table2 : File;
  const iconClass = isText ? 'bg-violet-50 text-violet-600' : isTable ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600';
  const legacyUrl = attachment.url && /^https?:\/\//i.test(attachment.url) ? attachment.url : null;
  const downloadHref = assetId ? `${apiConfig.baseUrl}/dam/library/${assetId}/download` : legacyUrl;

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:flex-nowrap ${className}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold text-slate-800" title={attachment.name}>{attachment.name}</p>
        <p className="text-[10px] text-slate-500">
          {kindLabel}
          {attachment.size && attachment.size !== '—' ? ` · ${attachment.size}` : ''}
          {attachment.uploadedAt ? ` · ${attachment.uploadedAt}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canPreview && (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            aria-label={`پیش‌نمایش ${attachment.name}`}
            title="پیش‌نمایش"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {/* فایل: دانلود مستقیم. متن: انتخاب قالب دانلود (TXT / Word / PDF). */}
        {canDownload && isText && (
          detail.isLoading && !detail.data
            ? <span role="status" aria-live="polite" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />در حال آماده‌سازی…</span>
            : <TextAssetActions title={attachment.name} html={textHtml} onView={() => setPreviewOpen(true)} canDownload showView={false} />
        )}
        {canDownload && !isText && downloadHref && (
          <a
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-indigo-600 transition-colors hover:bg-indigo-50"
            aria-label={`دانلود ${attachment.name}`}
            title="دانلود فایل"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />دانلود فایل
          </a>
        )}
        {!canDownload && downloadHref && !isText && (
          <a href={downloadHref} target="_blank" rel="noreferrer" aria-label={`دانلود ${attachment.name}`} title="دانلود فایل" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="حذف پیوست"
            aria-label={`حذف پیوست ${attachment.name}`}
            className="rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {previewOpen && assetId && (
        <DamAssetQuickPreview
          asset={{ id: assetId, title: attachment.name, type: isText ? 'content' : 'file' }}
          hint="این پیش‌نمایش همان نسخهٔ ثبت‌شده در مخزن مرکزی است؛ پیوست به جلسه وصل شده و فایل تکثیر نمی‌شود."
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
