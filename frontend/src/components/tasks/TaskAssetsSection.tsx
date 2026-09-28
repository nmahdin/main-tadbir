import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';
import { request } from '../../api/client';
import { formatToJalaliNumber, toPersianDigits } from '../../utils/jalali';
import {
  Paperclip,
  Upload,
  FileText,
  Download,
  Trash2,
  LoaderCircle,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
} from 'lucide-react';

interface RelatedAsset {
  id: number;
  title: string;
  latest_file?: {
    original_filename: string;
    file_size: number;
    mime_type?: string;
  } | null;
  created_at: string;
}

const isNumericId = (id: string) => /^\d+$/.test(id);

const formatSize = (bytes = 0) => {
  if (!bytes) return '—';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** i)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ${units[i]}`;
};

const fileIcon = (name: string, mime?: string) => {
  const m = (mime || '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (m.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext))
    return <Film className="w-4 h-4 text-violet-600 shrink-0" />;
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext))
    return <Music className="w-4 h-4 text-amber-600 shrink-0" />;
  if (['zip', 'rar', '7z'].includes(ext))
    return <Archive className="w-4 h-4 text-slate-500 shrink-0" />;
  return <FileText className="w-4 h-4 text-indigo-600 shrink-0" />;
};

/**
 * بخش یکپارچه فایل‌های تسک: فقط فایل‌های مرتبط با همین تسک را نشان می‌دهد
 * (هم ضمیمه‌های محلی و هم دارایی‌های مخزن مرکزی) بدون فیلترها و تنظیمات اضافی.
 */
export const TaskAssetsSection: React.FC<{ task: Task }> = ({ task }) => {
  const { addAttachment, deleteAttachment, notify } = useApp();
  const [related, setRelated] = useState<RelatedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const numericTask = isNumericId(task.id);
  const numericProject = isNumericId(task.projectId);

  const loadRelated = async () => {
    if (!numericTask) return;
    setLoading(true);
    try {
      const result = await request<{ data: RelatedAsset[] }>(`/dam/library?task_id=${task.id}&per_page=50`);
      setRelated(result.data || []);
    } catch {
      setRelated([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRelated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formattedSize = file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`
          : `${(file.size / 1024).toFixed(0)} کیلوبایت`;

        if (numericTask) {
          // آپلود در مخزن مرکزی با اتصال خودکار به همین تسک (و پروژه در صورت عددی بودن)
          const form = new FormData();
          form.append('file', file);
          form.append('title', file.name);
          form.append('task_id', task.id);
          if (numericProject) form.append('project_id', task.projectId);
          await request('/dam/library', { method: 'POST', body: form });
        } else {
          // تسک محلی: ذخیره ضمیمه محلی
          const url = URL.createObjectURL(file);
          const assetType = file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('video/') ? 'video'
            : file.type.startsWith('audio/') ? 'audio' : 'document';
          addAttachment(task.id, { name: file.name, size: formattedSize, type: assetType, url });
        }
      }
      if (numericTask) await loadRelated();
      notify({ type: 'success', title: 'فایل ثبت شد', message: 'فایل‌های انتخاب‌شده به این تسک متصل شدند.' });
    } catch (error) {
      notify({ type: 'error', title: 'آپلود ناموفق بود', message: error instanceof Error ? error.message : undefined });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteRelated = async (asset: RelatedAsset) => {
    if (!confirm(`آیا فایل «${asset.title}» از این تسک حذف شود؟`)) return;
    try {
      await request(`/dam/library/${asset.id}`, { method: 'DELETE' });
      setRelated(prev => prev.filter(a => a.id !== asset.id));
    } catch (error) {
      notify({ type: 'error', title: 'حذف ناموفق بود', message: error instanceof Error ? error.message : undefined });
    }
  };

  const totalCount = task.attachments.length + related.length;

  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-indigo-600" />
          <h4 className="text-xs font-bold text-slate-900">
            فایل‌های مرتبط ({toPersianDigits(totalCount)})
          </h4>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition-all disabled:opacity-50"
        >
          {uploading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          <span>{uploading ? 'در حال آپلود...' : 'افزودن فایل'}</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
        className="hidden"
      />

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
            <LoaderCircle className="w-4 h-4 animate-spin" />
            در حال دریافت فایل‌های مرتبط...
          </div>
        )}

        {/* فایل‌های مخزن مرکزی مرتبط با همین تسک */}
        {related.map(asset => (
          <div
            key={`dam-${asset.id}`}
            className="flex items-center justify-between p-3 bg-indigo-50/40 rounded-2xl border border-indigo-100 text-xs hover:bg-indigo-50/70 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {fileIcon(asset.latest_file?.original_filename || asset.title, asset.latest_file?.mime_type)}
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{asset.latest_file?.original_filename || asset.title}</p>
                <p className="text-[10px] text-slate-500">
                  {formatSize(asset.latest_file?.file_size)} • {formatToJalaliNumber(asset.created_at)}
                  <span className="mr-1.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">مخزن مرکزی</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={`/api/v1/dam/library/${asset.id}/download`}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود</span>
              </a>
              <button
                onClick={() => void handleDeleteRelated(asset)}
                title="حذف فایل"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {/* ضمیمه‌های محلی تسک */}
        {task.attachments.map(att => (
          <div
            key={att.id}
            className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs hover:bg-slate-100/70 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {fileIcon(att.name)}
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{att.name}</p>
                <p className="text-[10px] text-slate-500 font-mono">{toPersianDigits(att.size)} • ثبت: {formatToJalaliNumber(att.uploadDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {att.url && att.url !== '#' && (
                <a
                  href={att.url}
                  download={att.name}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود</span>
                </a>
              )}
              <button
                onClick={() => {
                  if (confirm(`آیا از حذف فایل «${att.name}» اطمینان دارید؟`)) {
                    deleteAttachment(task.id, att.id);
                  }
                }}
                title="حذف فایل"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {!loading && totalCount === 0 && (
          <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
            هیچ فایلی برای این وظیفه ثبت نشده است.
          </div>
        )}
      </div>
    </div>
  );
};
