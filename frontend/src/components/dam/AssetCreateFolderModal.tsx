import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  X, 
  FolderPlus, 
  Folder, 
  Check, 
  Briefcase, 
  Users 
} from 'lucide-react';

const FOLDER_COLORS = [
  { hex: '#6366f1', name: 'نیلی (پیش‌فرض)' },
  { hex: '#8b5cf6', name: 'بنفش' },
  { hex: '#ec4899', name: 'صورتی' },
  { hex: '#f43f5e', name: 'رز' },
  { hex: '#f59e0b', name: 'کهربایی' },
  { hex: '#10b981', name: 'زمردی' },
  { hex: '#06b6d4', name: 'فیروزه‌ای' },
  { hex: '#3b82f6', name: 'آبی' },
  { hex: '#64748b', name: 'سربی' }
];

export const AssetCreateFolderModal: React.FC = () => {
  const {
    isCreateFolderOpen,
    setIsCreateFolderOpen,
    createFolder,
    currentFolderId,
    folders,
    projects,
    teams,
    triggerCelebration
  } = useApp();

  const [folderName, setFolderName] = useState('');
  const [parentId, setParentId] = useState<string | null>(currentFolderId);
  const [color, setColor] = useState('#6366f1');
  const [projectId, setProjectId] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');

  if (!isCreateFolderOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    createFolder({
      name: folderName.trim(),
      parentId: parentId || null,
      color,
      projectId: projectId || undefined,
      teamId: teamId || undefined
    });

    triggerCelebration();
    setIsCreateFolderOpen(false);
    setFolderName('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs transition-colors"
              style={{ backgroundColor: color }}
            >
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">ایجاد پوشه جدید</h3>
              <p className="text-xs text-slate-600">دسته‌بندی و سامان‌دهی فایل‌ها در ساختار درختی</p>
            </div>
          </div>

          <button
            onClick={() => setIsCreateFolderOpen(false)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Folder Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">نام پوشه:</label>
            <input
              type="text"
              autoFocus
              required
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="مانند «طرح‌های UI و پروتوتایپ‌ها»، «مستندات فاز اول»..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* Parent Folder */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              <span>پوشه والد:</span>
            </label>
            <select
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden"
            >
              <option value="">📁 ریشه دارایی‌ها (Root Folder)</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>📁 {f.name}</option>
              ))}
            </select>
          </div>

          {/* Color Palette Picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">رنگ آیکون پوشه:</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map(c => (
                <button
                  type="button"
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  className={`w-7 h-7 rounded-xl flex items-center justify-center transition-transform cursor-pointer ${
                    color === c.hex ? 'scale-110 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {color === c.hex && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Project / Team association */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Briefcase className="w-3 h-3 text-indigo-500" />
                <span>پروژه (اختیاری):</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden truncate"
              >
                <option value="">هیچکدام</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Users className="w-3 h-3 text-purple-500" />
                <span>تیم (اختیاری):</span>
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden truncate"
              >
                <option value="">هیچکدام</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreateFolderOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <FolderPlus className="w-4 h-4" />
              <span>ایجاد پوشه</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
