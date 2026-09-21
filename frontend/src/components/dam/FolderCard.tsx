import React, { useState } from 'react';
import { AssetFolder } from '../../types';
import { useApp } from '../../context/AppContext';
import { 
  Folder, 
  MoreVertical, 
  Star, 
  Trash2, 
  Edit3, 
  Share2, 
  FolderOpen, 
  Users,
  Briefcase
} from 'lucide-react';

interface FolderCardProps {
  folder: AssetFolder;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  isSelected = false,
  onSelect
}) => {
  const { 
    setCurrentFolderId, 
    toggleFolderFavorite, 
    deleteFolder, 
    setShareTargetFolderId,
    openEditFolder,
    projects
  } = useApp();

  const [showMenu, setShowMenu] = useState(false);
  const linkedProject = projects.find(p => p.id === folder.projectId);

  return (
    <div
      onClick={() => setCurrentFolderId(folder.id)}
      className={`group relative p-4 rounded-3xl border transition-all duration-200 cursor-pointer select-none bg-white hover:shadow-md hover:border-indigo-300 ${
        isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/20 border-indigo-300' : 'border-slate-200/80 shadow-2xs'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Folder Icon with Custom Color */}
        <div 
          className="w-11 h-11 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-xs"
          style={{ backgroundColor: `${folder.color}15`, color: folder.color }}
        >
          <Folder className="w-6 h-6 fill-current" />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => toggleFolderFavorite(folder.id)}
            title={folder.isFavorite ? 'حذف از نشان‌شده‌ها' : 'نشان کردن پوشه'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              folder.isFavorite ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Star className={`w-4 h-4 ${folder.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                <div className="absolute left-0 mt-1 w-48 bg-white rounded-2xl shadow-lg border border-slate-200/90 py-1.5 z-30 text-xs text-slate-700 animate-in fade-in zoom-in-95">
                  <button
                    onClick={() => {
                      setCurrentFolderId(folder.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-600" />
                    <span>باز کردن پوشه</span>
                  </button>
                  <button
                    onClick={() => {
                      openEditFolder(folder);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold text-indigo-600"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ویرایش و تغییر نام</span>
                  </button>
                  <button
                    onClick={() => {
                      setShareTargetFolderId(folder.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <Share2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>اشتراک‌گذاری</span>
                  </button>
                  <button
                    onClick={() => {
                      toggleFolderFavorite(folder.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    <span>{folder.isFavorite ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}</span>
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => {
                      openEditFolder(folder);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>حذف پوشه</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Folder Name & Info */}
      <div className="mt-3">
        <h4 className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-600 transition-colors" title={folder.name}>
          {folder.name}
        </h4>
        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
          <span>{folder.itemCount || 0} فایل و سند</span>
          {folder.sharedWith && folder.sharedWith.length > 0 && (
            <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md font-medium text-[10px]">
              <Users className="w-3 h-3" />
              <span>مشترک</span>
            </span>
          )}
        </div>
      </div>

      {/* Linked Project pill if present */}
      {linkedProject && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-indigo-700 font-medium truncate bg-indigo-50/40 px-2 py-0.5 rounded-lg">
          <Briefcase className="w-3 h-3 text-indigo-600 shrink-0" />
          <span className="truncate">{linkedProject.name}</span>
        </div>
      )}
    </div>
  );
};
