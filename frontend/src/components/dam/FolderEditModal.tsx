import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AssetFolder } from '../../types';
import { X, Folder, Save, Trash2, Palette, AlertTriangle } from 'lucide-react';

export const FolderEditModal: React.FC = () => {
  const {
    isEditFolderOpen,
    setIsEditFolderOpen,
    folderToEdit,
    setFolderToEdit,
    updateFolder,
    deleteFolder,
    projects
  } = useApp();

  const [name, setName] = useState('');
  const [color, setColor] = useState('#f59e0b');
  const [projectId, setProjectId] = useState<string>('none');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (folderToEdit) {
      setName(folderToEdit.name || '');
      setColor(folderToEdit.color || '#f59e0b');
      setProjectId(folderToEdit.projectId || 'none');
      setShowDeleteConfirm(false);
    }
  }, [folderToEdit]);

  if (!isEditFolderOpen || !folderToEdit) return null;

  const handleClose = () => {
    setIsEditFolderOpen(false);
    setFolderToEdit(null);
    setShowDeleteConfirm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    updateFolder(folderToEdit.id, {
      name: name.trim(),
      color,
      projectId: projectId !== 'none' ? projectId : undefined
    });

    handleClose();
  };

  const handleDelete = () => {
    deleteFolder(folderToEdit.id);
    handleClose();
  };

  const colorOptions = [
    '#f59e0b', // Amber
    '#6366f1', // Indigo
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#64748b', // Slate
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-200">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                ویرایش پوشه
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تغییر نام، رنگ و پروژه مرتبط
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

        {showDeleteConfirm && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-rose-900">حذف پوشه «{folderToEdit.name}»؟</h4>
                <p className="text-[11px] text-rose-700">
                  فایل‌های درون این پوشه به پوشه اصلی منتقل خواهند شد.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
              >
                حذف شود
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              نام پوشه <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              پروژه مرتبط (اختیاری)
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
            >
              <option value="none">بدون پروژه (عمومی)</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  [{p.key}] {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-slate-500" />
              <span>رنگ آیکون پوشه</span>
            </label>
            <div className="flex items-center gap-2 pt-1">
              {colorOptions.map(c => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                    color === c ? 'scale-125 ring-2 ring-offset-2 ring-indigo-500' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف</span>
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
                <span>ذخیره</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
