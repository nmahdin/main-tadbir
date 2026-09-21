import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  X, 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Folder, 
  Briefcase, 
  CheckSquare, 
  Tag, 
  Globe, 
  Lock, 
  Users, 
  Check, 
  Plus,
  AlertCircle,
  Sparkles,
  FileCheck
} from 'lucide-react';
import { AssetCategory, AssetPermissionLevel } from '../../types';

interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  sizeFormatted: string;
  category: AssetCategory;
  extension: string;
  previewUrl?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed';
}

export const AssetUploadModal: React.FC = () => {
  const {
    isUploadAssetOpen,
    setIsUploadAssetOpen,
    uploadAsset,
    folders,
    projects,
    tasks,
    currentFolderId,
    triggerCelebration
  } = useApp();

  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [permissionLevel, setPermissionLevel] = useState<AssetPermissionLevel>('organization');
  const [tags, setTags] = useState<string[]>(['Assets']);
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isUploadAssetOpen) return null;

  const projectTasks = selectedProjectId 
    ? tasks.filter(t => t.projectId === selectedProjectId)
    : tasks;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '۰ بایت';
    const k = 1024;
    const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    const persianDigits = val.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
    return `${persianDigits} ${sizes[i]}`;
  };

  const getCategoryFromExt = (ext: string): AssetCategory => {
    const lower = ext.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp', 'ico'].includes(lower)) return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(lower)) return 'video';
    if (['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(lower)) return 'audio';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'].includes(lower)) return 'document';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(lower)) return 'archive';
    return 'other';
  };

  const processFiles = (files: FileList | File[]) => {
    const newItems: UploadQueueItem[] = [];

    Array.from(files).forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'other';
      const category = getCategoryFromExt(ext);
      const isImg = category === 'image';
      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;

      newItems.push({
        id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        name: file.name,
        size: file.size,
        sizeFormatted: formatBytes(file.size),
        category,
        extension: ext,
        previewUrl,
        progress: 100,
        status: 'pending'
      });
    });

    setQueue(prev => [...prev, ...newItems]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    if (!tags.includes(tagInput.trim())) {
      setTags(prev => [...prev, tagInput.trim()]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tg: string) => {
    setTags(prev => prev.filter(t => t !== tg));
  };

  const handleRemoveQueueItem = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queue.length === 0) return;

    setIsSubmitting(true);

    // Save each asset to DAM
    queue.forEach(item => {
      uploadAsset({
        title: item.name.replace(/\.[^/.]+$/, ''),
        fileName: item.name,
        size: item.size,
        sizeFormatted: item.sizeFormatted,
        category: item.category,
        url: item.previewUrl || '#',
        thumbnailUrl: item.previewUrl,
        folderId: selectedFolderId,
        projectId: selectedProjectId || undefined,
        taskId: selectedTaskId || undefined,
        tags,
        permissionLevel,
        description
      });
    });

    triggerCelebration();
    setIsSubmitting(false);
    setIsUploadAssetOpen(false);
    setQueue([]);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">بارگذاری دارایی‌های دیجیتال</h3>
              <p className="text-xs text-slate-600">بارگذاری امن تصاویر، ویدئوها، اسناد، صدا و بسته‌های فشرده</p>
            </div>
          </div>

          <button
            onClick={() => setIsUploadAssetOpen(false)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-indigo-600 bg-indigo-50/40 scale-[0.99]'
                : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFiles(e.target.files);
                }
              }}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-indigo-100/70 text-indigo-600 flex items-center justify-center shadow-xs">
              <Upload className="w-7 h-7" />
            </div>

            <div>
              <p className="font-bold text-slate-800 text-sm">
                فایل‌ها را به اینجا بکشید و رها کنید یا <span className="text-indigo-600 underline">انتخاب فایل</span>
              </p>
              <p className="text-xs text-slate-600 mt-1">
                پشتیبانی از انواع فرمت‌ها (PNG, JPG, PDF, MP4, MP3, XLSX, ZIP و ...) تا سقف ۲۵۰ مگابایت
              </p>
            </div>
          </div>

          {/* Queue List */}
          {queue.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                فایل‌های آماده بارگذاری ({queue.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-mono font-bold uppercase text-[10px] shrink-0">
                          {item.extension}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{item.name}</p>
                        <p className="text-[11px] text-slate-600 font-mono">{item.sizeFormatted}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveQueueItem(item.id)}
                      className="p-1.5 text-slate-600 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Organization & Association Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Folder Destination */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                <span>پوشه مقصد:</span>
              </label>
              <select
                value={selectedFolderId || ''}
                onChange={(e) => setSelectedFolderId(e.target.value || null)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="">📁 ریشه دارایی‌ها (Root)</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Linked Project */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                <span>پروژه مرتبط (اختیاری):</span>
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setSelectedTaskId('');
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="">بدون اتصال به پروژه</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Linked Task (Filtered) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                <span>تسک متصل (اختیاری):</span>
              </label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                disabled={!selectedProjectId}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden disabled:opacity-50"
              >
                <option value="">بدون اتصال به تسک</option>
                {projectTasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            {/* Access Permission Level */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span>سطح دسترسی و رویت:</span>
              </label>
              <select
                value={permissionLevel}
                onChange={(e) => setPermissionLevel(e.target.value as AssetPermissionLevel)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="organization">🌐 سازمانی (تمام کاربران سازمان)</option>
                <option value="project">💼 اعضای پروژه انتخابی</option>
                <option value="team">👥 اعضای تیم کاری</option>
                <option value="private">🔒 محرمانه و شخصی (فقط من)</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              <span>برچسب‌ها:</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="برچسب جدید (مثل Marketing, UI)..."
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                افزودن
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((tg, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium"
                >
                  <span>#{tg}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tg)}
                    className="p-0.5 hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">توضیحات اختیاری:</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="توضیحاتی در خصوص فایل‌ها، کاربرد یا استانداردهای مربوطه بنویسید..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden resize-none"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsUploadAssetOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={queue.length === 0 || isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <FileCheck className="w-4 h-4" />
              <span>بارگذاری و ثبت در سامانه ({queue.length})</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
