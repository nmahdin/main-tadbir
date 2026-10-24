import React, { useState } from 'react';
import { FileOutput, LoaderCircle, Paperclip } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useContent } from '../../queries/resources';
import { Modal, Button, Input } from '../common/Primitives';
import {
  AttachmentComposer,
  attachmentDraftCount,
  createEmptyAttachmentDraft,
  persistAttachmentDraft,
} from '../common/AttachmentComposer';
import type { ContentStage } from '../../types';

/**
 * ثبت خروجیِ مرحلهٔ محتوا از «کارتابل من».
 *
 * همان مدالی که در صفحهٔ جزئیات محتوا باز می‌شود، اینجا هم درجا باز می‌شود تا
 * کاربر برای تحویل خروجیِ یک مرحله به صفحهٔ دیگری نرود: فایل را همین‌جا
 * بارگذاری می‌کند (یا از مخزن برمی‌گزیند) و خروجی در همان مرحله ثبت می‌شود.
 * قواعد ثبت (بررسی مرحله، اتصال دارایی و پیشبرد وضعیت) همان مسیرِ سرور است و
 * در اینجا تکرار نشده است.
 */
export const ContentStageOutputModal: React.FC<{
  contentId: string;
  stageId: string;
  stageTitle?: string;
  contentTitle: string;
  onClose: () => void;
}> = ({ contentId, stageId, stageTitle, contentTitle, onClose }) => {
  const { hasPermission, addStageDeliverable, updateStageStatus } = useApp();
  const contentQuery = useContent(contentId);
  const canUpload = hasPermission('assets.upload');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState(createEmptyAttachmentDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const content = contentQuery.data as (typeof contentQuery.data & { code?: string; stages?: ContentStage[] }) | undefined;
  const stage = (content?.stages || []).find(item => item.id === stageId) || null;
  const count = attachmentDraftCount(draft);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!count && !title.trim()) {
      setError('یک فایل، دارایی یا عنوان برای خروجی وارد کنید.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // مرحله باید همین حالا در جریان همین پرونده باشد؛ در غیر این صورت ثبتِ
      // دارایی بی‌صاحب در مخزن می‌ماند.
      if (!stage) throw new Error('این مرحله دیگر در جریان این پرونده نیست؛ کارتابل را تازه کنید و دوباره تلاش کنید.');
      const externalUrl = url.trim();
      const description = notes.trim();
      if (externalUrl && !/^https?:\/\//i.test(externalUrl)) throw new Error('پیوند باید با http یا https شروع شود.');
      const persisted = count
        ? await persistAttachmentDraft(draft, {
          contentId,
          contentBucket: 'outputs',
          relationRole: 'stage_output',
          stageId: stage.id,
        }, `${contentTitle} — ${stage.title}`)
        : [];

      if (persisted.length) {
        for (const asset of persisted) {
          const saved = await addStageDeliverable(contentId, stage.id, `out-${asset.type}-${asset.assetId}`, {
            title: title.trim() || asset.name,
            assetId: asset.type === 'data_table' ? undefined : String(asset.assetId),
            assetVersionId: asset.assetVersionId ? String(asset.assetVersionId) : undefined,
            assetVersionNumber: asset.assetVersionNumber,
            fileName: asset.type === 'file' ? asset.name : undefined,
            fileSize: asset.size ? `${(asset.size / 1024 / 1024).toFixed(2)} MB` : undefined,
            url: externalUrl || asset.previewUrl || undefined,
            value: description || undefined,
            dataTableId: asset.type === 'data_table' && asset.dataTableId ? String(asset.dataTableId) : undefined,
            dataTableName: asset.type === 'data_table' ? asset.name : undefined,
            rowIds: asset.type === 'data_table' ? (asset.rowIds || []).map(String) : undefined,
            rowLabels: asset.type === 'data_table' ? asset.rowLabels : undefined,
          });
          if (!saved) throw new Error('اتصال یکی از خروجی‌ها به مرحله ذخیره نشد؛ دوباره تلاش کنید.');
        }
      } else {
        const saved = await addStageDeliverable(contentId, stage.id, `out-note-${Date.now()}`, {
          title: title.trim(),
          url: externalUrl || undefined,
          value: description || undefined,
        });
        if (!saved) throw new Error('ثبت خروجی مرحله ذخیره نشد؛ دوباره تلاش کنید.');
      }

      // همان رفتارِ صفحهٔ محتوا: مرحلهٔ بدون ارزیاب با ثبت خروجی کامل می‌شود و
      // مرحلهٔ در حال انجام، آمادهٔ ارسال برای بررسی می‌شود.
      const alreadyHasOutput = (stage.outputs || []).some(output => Boolean(output.isDelivered || output.value || output.url || output.assetId || output.fileName));
      if (stage.reviewRequired === false) {
        await updateStageStatus(contentId, stage.id, 'completed');
      } else if (stage.status === 'in_progress' && !alreadyHasOutput) {
        await updateStageStatus(contentId, stage.id, 'ready_for_review');
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ثبت خروجی انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="ثبت خروجی مرحله"
      description={`پرونده: ${contentTitle}${stageTitle ? ` · مرحله: ${stageTitle}` : ''}`}
      icon={<FileOutput className="h-5 w-5" />}
      size="lg"
    >
      <form className="space-y-4 p-5" onSubmit={submit}>
        {contentQuery.isPending && <p className="text-[11px] text-slate-400">در حال دریافت اطلاعات پرونده و مرحله…</p>}
        {contentQuery.isError && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-6 text-rose-700">دریافت اطلاعات این پرونده ناموفق بود؛ کارتابل را تازه کنید و دوباره تلاش کنید.</p>}

        <label className="block text-[11px] font-bold text-slate-700">
          عنوان خروجی
          <Input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="مثال: نسخهٔ نهایی پوستر"
            maxLength={255}
            className="mt-1 h-10 text-[12px]"
          />
        </label>

        {canUpload
          ? <AttachmentComposer
              value={draft}
              onChange={setDraft}
              disabled={saving}
              title="فایل‌ها و دارایی‌های خروجی"
              linkTarget={{ contentId }}
              // نام نمایشیِ فایل‌های خروجی پیش‌فرضاً کد همین پرونده است.
              defaultFileDisplayName={String(content?.code || '').trim() || undefined}
            />
          : <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-800">
              مجوز بارگذاری در مخزن مرکزی برای شما فعال نیست؛ خروجی را با عنوان، پیوند یا توضیحات زیر ثبت کنید.
            </p>}

        <label className="block text-[11px] font-bold text-slate-700">
          پیوند دسترسی یا دانلود (اختیاری)
          <Input
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="https://"
            dir="ltr"
            className="mt-1 h-10 text-[12px]"
          />
        </label>

        <label className="block text-[11px] font-bold text-slate-700">
          توضیحات تکمیلی
          <textarea
            rows={3}
            value={notes}
            onChange={event => setNotes(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-indigo-400"
          />
        </label>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-6 text-rose-700">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <Paperclip className="h-3.5 w-3.5" />
            {stage?.reviewRequired === false ? 'با ثبت خروجی، مرحله کامل می‌شود.' : 'با ثبت خروجی، مرحله برای بررسی آماده می‌شود.'}
          </span>
          <span className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={saving || contentQuery.isPending || !stage}>
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileOutput className="h-3.5 w-3.5" />}
              {saving ? 'در حال ثبت…' : 'ثبت خروجی'}
            </Button>
          </span>
        </div>
      </form>
    </Modal>
  );
};
