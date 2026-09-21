import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AssetCard } from './AssetCard';
import { AssetRow } from './AssetRow';
import { AssetThumbnail } from './AssetThumbnail';
import { 
  Upload, 
  Plus, 
  FolderOpen, 
  LayoutGrid, 
  List, 
  Search, 
  FileText,
  Filter
} from 'lucide-react';
import { AssetCategory } from '../../types';

interface ProjectAssetsTabProps {
  projectId: string;
}

export const ProjectAssetsTab: React.FC<ProjectAssetsTabProps> = ({ projectId }) => {
  const {
    assets,
    setIsUploadAssetOpen,
    projects
  } = useApp();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'all'>('all');

  const project = projects.find(p => p.id === projectId);
  const projectAssets = assets.filter(a => a.projectId === projectId && !a.isTrash);

  const filteredAssets = projectAssets.filter(asset => {
    if (categoryFilter !== 'all' && asset.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = asset.title.toLowerCase().includes(q);
      const matchFile = asset.fileName.toLowerCase().includes(q);
      const matchTags = asset.tags.some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchFile && !matchTags) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Tab Header Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-600 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در فایل‌های پروژه..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden"
          >
            <option value="all">تمام فرمت‌ها</option>
            <option value="image">تصاویر</option>
            <option value="video">ویدئوها</option>
            <option value="document">اسناد و PDF</option>
            <option value="audio">صوت</option>
            <option value="archive">فشرده</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setIsUploadAssetOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>بارگذاری فایل در این پروژه</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredAssets.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <FolderOpen className="w-7 h-7" />
          </div>
          <h4 className="font-bold text-sm text-slate-900">هیچ فایلی برای این پروژه ثبت نشده است</h4>
          <p className="text-xs text-slate-600 max-w-sm mt-1 mb-5">
            می‌توانید طرح‌های طراحی، مستندات، فایل‌های فنی یا قراردادهای این پروژه را از طریق ماژول DAM بارگذاری کنید.
          </p>
          <button
            onClick={() => setIsUploadAssetOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>بارگذاری اولین فایل</span>
          </button>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && filteredAssets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map(asset => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && filteredAssets.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase">
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3">نام فایل</th>
                <th className="py-3 px-3">پروژه</th>
                <th className="py-3 px-3">سطح دسترسی</th>
                <th className="py-3 px-3">حجم</th>
                <th className="py-3 px-3">تاریخ ویرایش</th>
                <th className="py-3 px-3">بارگذار</th>
                <th className="py-3 px-3 text-left">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => (
                <AssetRow key={asset.id} asset={asset} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
