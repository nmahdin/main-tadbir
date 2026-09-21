import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { 
  X, 
  History, 
  Upload, 
  Check, 
  Layers, 
  FileText,
  AlertCircle,
  FileCheck,
  Download,
  Trash2,
  RotateCcw,
  Clock,
  Sparkles,
  AlertTriangle,
  Info
} from 'lucide-react';

export const AssetVersionModal: React.FC = () => {
  const {
    versionModalAssetId,
    setVersionModalAssetId,
    assets,
    users,
    uploadNewVersion,
    deleteAssetVersion,
    revertToAssetVersion,
    downloadAsset,
    triggerCelebration
  } = useApp();

  const [activeTab, setActiveTab] = useState<'history' | 'upload'>('history');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [changelog, setChangelog] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<{ id: string; versionNumber: number; fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!versionModalAssetId) return null;

  const asset = assets.find(a => a.id === versionModalAssetId);
  if (!asset) return null;

  const nextVersionNumber = (asset.currentVersion || 1) + 1;
  const versionsList = asset.versions || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsSubmitting(true);

    uploadNewVersion(asset.id, {
      fileName: selectedFile.name,
      size: selectedFile.size,
      changelog: changelog.trim() || `به‌روزرسانی به نسخه ${nextVersionNumber}.0`
    });

    triggerCelebration();
    setIsSubmitting(false);
    setSelectedFile(null);
    setChangelog('');
    setActiveTab('history');
  };

  const handleConfirmDeleteVersion = () => {
    if (!versionToDelete) return;
    deleteAssetVersion(asset.id, versionToDelete.id);
    setVersionToDelete(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 text-right" dir="rtl">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">مدیریت و تاریخچه نسخه‌های فایل</h3>
              <p className="text-xs text-slate-600">
                فایل: <span className="font-bold text-slate-800">{asset.title}</span> • نسخه فعال: <span className="font-bold font-mono text-amber-700">v{asset.currentVersion}.0</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setVersionModalAssetId(null);
              setVersionToDelete(null);
            }}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-3 border-b border-slate-200 flex gap-4 bg-white">
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-xs font-extrabold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>نسخه‌های موجود در سیستم ({versionsList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 text-xs font-extrabold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>بارگذاری نسخه جدید (v{nextVersionNumber}.0)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[65vh]">
          {activeTab === 'history' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600 bg-amber-50/70 p-3 rounded-2xl border border-amber-200/80">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    شما می‌توانید هر یک از نسخه‌های قبلی را مشاهده، دانلود، به عنوان نسخه فعال سامانه بازگردانی یا از روی سیستم پاک کنید.
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-colors shrink-0 shadow-xs cursor-pointer"
                >
                  + افزودن نسخه
                </button>
              </div>

              {versionsList.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  هیچ نسخه‌ای برای این فایل ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-3">
                  {versionsList.map((ver, idx) => {
                    const uploader = users.find(u => u.id === ver.uploadedBy);
                    const isActive = ver.versionNumber === asset.currentVersion;

                    return (
                      <div
                        key={ver.id || `ver-${idx}`}
                        className={`p-4 rounded-2xl border transition-all ${
                          isActive
                            ? 'bg-amber-50/40 border-amber-300 ring-1 ring-amber-300/50 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Version Metadata */}
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-mono font-black text-sm shrink-0 shadow-2xs ${
                                isActive
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              v{ver.versionNumber}
                            </div>

                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 text-xs truncate">
                                  {ver.fileName}
                                </span>
                                {isActive && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold flex items-center gap-1 border border-amber-300">
                                    <Check className="w-3 h-3" />
                                    نسخه فعال
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                <span className="font-medium">{ver.sizeFormatted}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {ver.uploadedAt}
                                </span>
                                {uploader && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1 text-slate-700 font-medium">
                                      <Avatar user={uploader} size="xs" />
                                      {uploader.name}
                                    </span>
                                  </>
                                )}
                              </div>

                              {ver.changelog && (
                                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2 leading-relaxed">
                                  {ver.changelog}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Download */}
                            <button
                              onClick={() => downloadAsset({ ...asset, fileName: ver.fileName, size: ver.size, sizeFormatted: ver.sizeFormatted })}
                              title="دانلود این نسخه"
                              className="p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            {/* Revert / Make Active */}
                            {!isActive && (
                              <button
                                onClick={() => revertToAssetVersion(asset.id, ver.id)}
                                title="فعال‌سازی و بازگردانی این نسخه"
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>فعال‌سازی</span>
                              </button>
                            )}

                            {/* Delete Version */}
                            {versionsList.length > 1 && (
                              <button
                                onClick={() => setVersionToDelete({ id: ver.id, versionNumber: ver.versionNumber, fileName: ver.fileName })}
                                title="پاک کردن این نسخه از سیستم"
                                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Target Asset Info */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-600 block">فایل هدف:</span>
                  <span className="font-bold text-slate-900">{asset.title}</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-bold">
                  نسخه فعلی: v{asset.currentVersion}.0 → نسخه جدید: v{nextVersionNumber}.0
                </span>
              </div>

              {/* File Picker */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {selectedFile ? selectedFile.name : 'انتخاب یا رها کردن فایل نسخه جدید'}
                </p>
                <p className="text-[11px] text-slate-600">
                  {selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} مگابایت` : 'تمام فرمت‌های فایل پشتیبانی می‌شوند'}
                </p>
              </div>

              {/* Changelog Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">تغییرات و یادداشت نسخه (Changelog):</label>
                <textarea
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  rows={3}
                  required
                  placeholder="چه مواردی در این نسخه اصلاح یا به‌روزرسانی شده است؟ (مثال: اعمال نظرات کارفرما در تایپوگرافی و اصلاح رنگ‌ها)..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-amber-500 focus:outline-hidden resize-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  بازگشت به تاریخچه
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>ثبت و انتشار نسخه {nextVersionNumber}.0</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>مجموع نسخه‌های ذخیره‌شده: {versionsList.length}</span>
          <button
            onClick={() => {
              setVersionModalAssetId(null);
              setVersionToDelete(null);
            }}
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold transition-colors cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>
      </div>

      {/* Delete Version Confirmation Modal */}
      {versionToDelete && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in zoom-in-95 duration-200 text-right">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h4 className="font-extrabold text-slate-900 text-base">حذف نسخه فایل از سامانه</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                آیا از حذف دائمی <span className="font-bold text-slate-900">نسخه v{versionToDelete.versionNumber}.0 ({versionToDelete.fileName})</span> از روی سیستم اطمینان دارید؟ این عملیات قابل بازگشت نیست.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setVersionToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteVersion}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>بله، حذف نسخه</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
