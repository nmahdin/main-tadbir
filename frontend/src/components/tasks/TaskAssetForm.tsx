import React, { useRef, useState } from 'react';
import {
  FileText,
  Upload,
  Table,
  X,
  Check,
  ArrowRight,
  Link2,
} from 'lucide-react';
import { request } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';

/** Uses the existing private DAM upload endpoint, never a public/token-bearing upload URL. */
export function TaskAssetForm({
  task,
  initialKind,
  onClose,
  onSaved,
  onRow,
}: {
  task: Task;
  initialKind: string;
  onClose: () => void;
  onSaved: () => void;
  onRow: () => void;
}) {
  const { hasPermission } = useApp();
  const [kind, setKind] = useState(
    ['file', 'link'].includes(initialKind) ? initialKind : 'text',
  );
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const allowed =
    hasPermission('assets.view') && hasPermission('assets.upload');
  const validate = () => {
    if (!title.trim()) return 'عنوان دارایی را وارد کنید.';
    if (kind === 'text' && !body.trim()) return 'متن دارایی را وارد کنید.';
    if (kind === 'link') {
      try {
        const url = new URL(body);
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          body.length > 2000
        )
          return 'لینک HTTPS معتبر و بدون نام کاربری یا رمز وارد کنید.';
      } catch {
        return 'لینک HTTPS کامل وارد کنید.';
      }
    }
    if (kind === 'file' && !file) return 'فایل را انتخاب کنید.';
    if (file && kind === 'file' && file.size > 20 * 1024 * 1024)
      return 'حداکثر اندازهٔ فایل ۲۰ مگابایت است؛ محدودیت هاست نیز اعمال می‌شود.';
    return '';
  };
  const save = async () => {
    if (!allowed || !preview || submitting.current) return;
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      data.append('title', title.trim());
      data.append('task_id', task.id);
      data.append('status', 'draft');
      data.append('confidentiality', 'confidential');
      if (kind === 'file' && file) data.append('file', file);
      else data.append('body', body);
      await request('/dam/library', { method: 'POST', body: data });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ثبت ناموفق بود.');
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };
  return (
    <section
      className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4"
      aria-label="فرم ثبت دارایی تسک"
      dir="rtl"
    >
      <header className="flex justify-between items-start gap-3">
        <div>
          <h3 className="font-bold text-indigo-950">
            ثبت دارایی برای همین تسک
          </h3>
          <p className="text-xs text-slate-500 mt-1 break-words">
            {task.title}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="بستن فرم دارایی"
        >
          <X size={18} />
        </button>
      </header>
      {!preview && (
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'text', label: 'متن', icon: FileText },
            { id: 'file', label: 'فایل', icon: Upload },
            { id: 'link', label: 'لینک مرجع', icon: Link2 },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!allowed || busy}
              onClick={() => {
                setKind(item.id);
                setError('');
              }}
              aria-pressed={kind === item.id}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-40 ${kind === item.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200'}`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || !hasPermission('assets.view')}
            onClick={onRow}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs bg-white border border-slate-200"
          >
            <Table size={16} />
            ردیف جدول
          </button>
        </div>
      )}
      {!allowed ? (
        <p className="text-xs text-amber-800 leading-7">
          برای ثبت متن یا فایل به مجوز بارگذاری دارایی نیاز دارید. ثبت ردیف،
          تابع دسترسی ویرایش همان جدول است.
        </p>
      ) : preview ? (
        <div className="rounded-xl bg-white p-4 space-y-3 text-sm">
          <h4 className="font-bold break-words">{title}</h4>
          {kind === 'file' ? (
            <p className="break-all" dir="auto">
              {file?.name} ·{' '}
              {((file?.size || 0) / 1024).toLocaleString('fa-IR', {
                maximumFractionDigits: 1,
              })}{' '}
              KB
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words max-h-56 overflow-auto">
              {body}
            </p>
          )}
          <p className="text-xs text-slate-500">
            🔒 پیش‌نویس محرمانه؛ مالک و مدیر دسترسی دارند. تنظیم اشتراک‌گذاری از
            مخزن دارایی انجام می‌شود.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs font-bold">
            عنوان
            <input
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 bg-white"
            />
          </label>
          {kind === 'link' ? (
            <label className="block text-xs font-bold">
              نشانی HTTPS
              <input
                type="url"
                dir="ltr"
                maxLength={2000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-3 bg-white"
              />
              <span className="block font-normal text-slate-500 leading-7 mt-2">
                نشانی به‌صورت متن ذخیره می‌شود؛ فایل از اینترنت دانلود نمی‌شود.
                لینک دارای اطلاعات محرمانه نفرستید.
              </span>
            </label>
          ) : kind === 'text' ? (
            <label className="block text-xs font-bold">
              متن دارایی
              <textarea
                maxLength={3000}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-3 bg-white font-normal"
              />
            </label>
          ) : (
            <label className="block text-xs font-bold">
              فایل — حداکثر ۲۰ مگابایت
              <input
                type="file"
                onChange={(e) => {
                  const chosen = e.target.files?.[0] || null;
                  setFile(chosen);
                  if (!title && chosen) setTitle(chosen.name.slice(0, 255));
                }}
                className="block w-full mt-3 text-xs"
              />
            </label>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-700 leading-7">
          {error}
        </p>
      )}
      {allowed && (
        <div className="flex gap-2">
          {preview && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setPreview(false)}
              className="text-xs flex gap-1 items-center px-3"
            >
              <ArrowRight size={14} />
              اصلاح
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (preview) void save();
              else {
                const invalid = validate();
                setError(invalid);
                if (!invalid) setPreview(true);
              }
            }}
            className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 disabled:opacity-40"
          >
            <Check size={16} />
            {busy
              ? 'در حال ثبت…'
              : preview
                ? 'تأیید و ثبت دارایی'
                : 'پیش‌نمایش'}
          </button>
        </div>
      )}
    </section>
  );
}
