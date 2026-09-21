import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DigitalAsset, AssetCategory, AssetPermissionLevel } from '../../types';
import { 
  X, 
  FileText, 
  Save, 
  Trash2, 
  FolderKanban, 
  Folder, 
  Tag, 
  ShieldCheck, 
  AlertTriangle 
} from 'lucide-react';

export const AssetEditModal: React.FC = () => {
  const {
    isEditAssetOpen,
    setIsEditAssetOpen,
    assetToEdit,
    setAssetToEdit,
    updateAsset,
    deleteAsset,
    projects,
    folders
  } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<AssetCategory>('document');
  const [projectId, setProjectId] = useState<string>('none');
  const [folderId, setFolderId] = useState<string>('root');
  const [permissionLevel, setPermissionLevel] = useState<AssetPermissionLevel>('organization');
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (assetToEdit) {
      setTitle(assetToEdit.title || '');
      setDescription(assetToEdit.description || '');
      setCategory(assetToEdit.category || 'document');
      setProjectId(assetToEdit.projectId || 'none');
      setFolderId(assetToEdit.folderId || 'root');
      setPermissionLevel(assetToEdit.permissionLevel || 'organization');
      setTagInput((assetToEdit.tags || []).join(', '));
      setShowDeleteConfirm(false);
    }
  }, [assetToEdit]);

  if (!isEditAssetOpen || !assetToEdit) return null;

  const handleClose = () => {
    setIsEditAssetOpen(false);
    setAssetToEdit(null);
    setShowDeleteConfirm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    updateAsset(assetToEdit.id, {
      title: title.trim(),
      description: description.trim(),
      category,
      projectId: projectId !== 'none' ? projectId : undefined,
      folderId: folderId !== 'root' ? folderId : null,
      permissionLevel,
      tags
    });

    handleClose();
  };

  const handleDelete = () => {
    deleteAsset(assetToEdit.id);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                ویرایش اطلاعات دارایی دیجیتال
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {assetToEdit.fileName} ({assetToEdit.sizeFormatted})
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="p-5 bg-rose-50 border-b border-rose-200 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-900">انتقال به سطل زباله؟</h4>
                <p className="text-xs text-rose-700">
                  این فایل به سطل زباله منتقل می‌شود و در صورت نیاز تا ۳۰ روز قابل بازیابی است.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید حذف</span>
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              عنوان نمایشی دارایی <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              توضیحات و یادداشت‌ها
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیحاتی در مورد محتوا، کاربرد یا نسخه فایل..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden resize-none transition-all"
            />
          </div>

          {/* Project linkage - Core feature! */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5 text-indigo-600" />
              <span>اتصال به پروژه مرتبط</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
            >
              <option value="none">بدون پروژه (عمومی / دارایی سازمانی)</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  [{p.key}] {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Folder & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                <span>پوشه مقصد</span>
              </label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                <option value="root">📁 پوشه اصلی (Root)</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                دسته‌بندی محتوایی
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AssetCategory)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                <option value="image">تصویر و طرح (Image)</option>
                <option value="document">سند و مستندات (Document)</option>
                <option value="video">ویدیو و موشن (Video)</option>
                <option value="audio">صوت و پادکست (Audio)</option>
                <option value="archive">آرشیو و فشرده (Archive)</option>
                <option value="other">سایر فرمت‌ها (Other)</option>
              </select>
            </div>
          </div>

          {/* Permission Level & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>سطح دسترسی</span>
              </label>
              <select
                value={permissionLevel}
                onChange={(e) => setPermissionLevel(e.target.value as AssetPermissionLevel)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                <option value="organization">کل سازمان (Public/Org)</option>
                <option value="project">فقط اعضای پروژه مرتبط</option>
                <option value="team">فقط تیم اختصاصی</option>
                <option value="private">خصوصی (فقط مالک)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                <span>برچسب‌ها (با کاما)</span>
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="لوگو, بنر, قرارداد"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف فایل</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
