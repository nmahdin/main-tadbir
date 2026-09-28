import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { AssetCard } from './AssetCard';
import { AssetRow } from './AssetRow';
import { FolderCard } from './FolderCard';
import { AssetThumbnail, getCategoryIcon } from './AssetThumbnail';
import { 
  FolderPlus, 
  Upload, 
  LayoutGrid, 
  List, 
  Search, 
  Filter, 
  HardDrive, 
  Layers, 
  Share2, 
  Star, 
  Trash2, 
  Clock, 
  Briefcase, 
  Folder, 
  ChevronRight, 
  ArrowUpDown, 
  Download, 
  Check, 
  RotateCcw,
  Sparkles,
  FolderOpen,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Archive,
  Grid
} from 'lucide-react';
import { AssetCategory } from '../../types';

export const DamMainView: React.FC = () => {
  const {
    assets,
    folders,
    damSubView,
    setDamSubView,
    currentFolderId,
    setCurrentFolderId,
    setIsUploadAssetOpen,
    setIsCreateFolderOpen,
    batchDeleteAssets,
    batchRestoreAssets,
    batchMoveAssets,
    emptyTrash,
    projects,
    users
  } = useApp();

  // View state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | 'all'>('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterUserId, setFilterUserId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'title' | 'size' | 'downloads'>('updatedAt');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [moveFolderTargetId, setMoveFolderTargetId] = useState<string | null>(null);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);

  // Current Folder Object & Breadcrumbs
  const currentFolder = folders.find(f => f.id === currentFolderId);
  const breadcrumbs = useMemo(() => {
    const list = [];
    let curr = currentFolder;
    while (curr) {
      list.unshift(curr);
      curr = folders.find(f => f.id === curr?.parentId);
    }
    return list;
  }, [currentFolder, folders]);

  // Subfolders of current folder
  const currentSubFolders = useMemo(() => {
    if (damSubView === 'trash') return [];
    if (damSubView === 'favorites') return folders.filter(f => f.isFavorite);
    if (damSubView === 'shared') return folders.filter(f => f.sharedWith && f.sharedWith.length > 0);
    if (damSubView === 'projects') return folders.filter(f => f.projectId);
    return folders.filter(f => f.parentId === currentFolderId);
  }, [folders, currentFolderId, damSubView]);

  // Filtered Assets logic
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      // Sub-view filtering
      if (damSubView === 'trash') {
        if (!asset.isTrash) return false;
      } else {
        if (asset.isTrash) return false;

        if (damSubView === 'favorites' && !asset.isFavorite) return false;
        if (damSubView === 'shared' && (!asset.sharedWith || asset.sharedWith.length === 0)) return false;
        if (damSubView === 'projects' && !asset.projectId) return false;
        if (damSubView === 'folders') {
          if (asset.folderId !== currentFolderId) return false;
        }
        if (damSubView === 'all') {
          // If in a folder, only show assets in that folder
          if (currentFolderId && asset.folderId !== currentFolderId) return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'all' && asset.category !== selectedCategory) {
        return false;
      }

      // Project filter
      if (filterProjectId !== 'all' && asset.projectId !== filterProjectId) {
        return false;
      }

      // User filter
      if (filterUserId !== 'all' && asset.createdBy !== filterUserId) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesTitle = asset.title.toLowerCase().includes(q);
        const matchesFile = asset.fileName.toLowerCase().includes(q);
        const matchesTags = asset.tags.some(t => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesFile && !matchesTags) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'fa');
      if (sortBy === 'size') return b.size - a.size;
      if (sortBy === 'downloads') return (b.downloadCount || 0) - (a.downloadCount || 0);
      return b.id.localeCompare(a.id);
    });
  }, [assets, damSubView, currentFolderId, selectedCategory, filterProjectId, filterUserId, searchQuery, sortBy]);

  // Overall Stats
  const activeAssets = assets.filter(a => !a.isTrash);
  const totalSizeBytes = activeAssets.reduce((acc, a) => acc + a.size, 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const sharedCount = activeAssets.filter(a => a.sharedWith && a.sharedWith.length > 0).length;
  const projectAssetsCount = activeAssets.filter(a => a.projectId).length;
  const favoritesCount = activeAssets.filter(a => a.isFavorite).length;
  const trashCount = assets.filter(a => a.isTrash).length;

  const handleToggleSelectAsset = (id: string) => {
    setSelectedAssetIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedAssetIds.length === filteredAssets.length) {
      setSelectedAssetIds([]);
    } else {
      setSelectedAssetIds(filteredAssets.map(a => a.id));
    }
  };

  const handleBatchDelete = () => {
    if (confirm(`آیا از انتقال ${selectedAssetIds.length} فایل انتخاب‌شده به سطل زباله اطمینان دارید؟`)) {
      batchDeleteAssets(selectedAssetIds);
      setSelectedAssetIds([]);
    }
  };

  const handleBatchRestore = () => {
    batchRestoreAssets(selectedAssetIds);
    setSelectedAssetIds([]);
  };

  const handleBatchMove = (targetFolder: string | null) => {
    batchMoveAssets(selectedAssetIds, targetFolder);
    setSelectedAssetIds([]);
    setShowMoveDropdown(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">مدیریت دارایی‌های دیجیتال (DAM)</h1>
              <p className="text-xs text-slate-600">
                مرکز یکپارچه ذخیره‌سازی، نسخه‌بندی، دسترسی و اشتراک‌گذاری فایل‌ها و مستندات سازمان تدبیر
              </p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons & Storage Meter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Storage Meter Pill */}
          <div className="px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex items-center gap-3">
            <HardDrive className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="font-bold text-slate-800">{totalSizeMB} مگابایت</span>
                <span className="text-slate-600">از ۱۰۰ گیگابایت</span>
              </div>
              <div className="w-24 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: '4%' }} />
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsCreateFolderOpen(true)}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            <span>پوشه جدید</span>
          </button>

          <button
            onClick={() => setIsUploadAssetOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Upload className="w-4 h-4" />
            <span>بارگذاری دارایی جدید</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div 
          onClick={() => { setDamSubView('all'); setCurrentFolderId(null); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            damSubView === 'all' && !currentFolderId ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-500' : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-indigo-600 mb-2">
            <Layers className="w-5 h-5" />
            <span className="text-[10px] font-bold bg-indigo-100/70 px-2 py-0.5 rounded-full font-mono">{activeAssets.length}</span>
          </div>
          <span className="text-xs text-slate-600 font-medium block">کل دارایی‌ها</span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">{activeAssets.length} فایل</span>
        </div>

        <div 
          onClick={() => { setDamSubView('folders'); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            damSubView === 'folders' ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-500' : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <Folder className="w-5 h-5" />
            <span className="text-[10px] font-bold bg-amber-100/70 px-2 py-0.5 rounded-full font-mono">{folders.length}</span>
          </div>
          <span className="text-xs text-slate-600 font-medium block">پوشه‌ها و دسته‌ها</span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">{folders.length} پوشه</span>
        </div>

        <div 
          onClick={() => { setDamSubView('projects'); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            damSubView === 'projects' ? 'bg-blue-50/60 border-blue-300 ring-2 ring-blue-500' : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <Briefcase className="w-5 h-5" />
            <span className="text-[10px] font-bold bg-blue-100/70 px-2 py-0.5 rounded-full font-mono">{projectAssetsCount}</span>
          </div>
          <span className="text-xs text-slate-600 font-medium block">فایل‌های پروژه‌ها</span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">{projectAssetsCount} مورد</span>
        </div>

        <div 
          onClick={() => { setDamSubView('favorites'); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            damSubView === 'favorites' ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-500' : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-500 mb-2">
            <Star className="w-5 h-5" />
            <span className="text-[10px] font-bold bg-amber-100/70 px-2 py-0.5 rounded-full font-mono">{favoritesCount}</span>
          </div>
          <span className="text-xs text-slate-600 font-medium block">نشان‌شده‌ها</span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">{favoritesCount} مورد</span>
        </div>

        <div 
          onClick={() => { setDamSubView('trash'); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            damSubView === 'trash' ? 'bg-rose-50/60 border-rose-300 ring-2 ring-rose-500' : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-500 mb-2">
            <Trash2 className="w-5 h-5" />
            <span className="text-[10px] font-bold bg-rose-100/70 px-2 py-0.5 rounded-full font-mono">{trashCount}</span>
          </div>
          <span className="text-xs text-slate-600 font-medium block">سطل زباله</span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">{trashCount} مورد</span>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => { setDamSubView('all'); setCurrentFolderId(null); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              damSubView === 'all' && !currentFolderId
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>همه دارایی‌ها</span>
          </button>

          <button
            onClick={() => { setDamSubView('recent'); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              damSubView === 'recent'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>فایل‌های اخیر</span>
          </button>

          <button
            onClick={() => { setDamSubView('folders'); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              damSubView === 'folders' || currentFolderId
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>پوشه‌ها و ساختار درختی</span>
          </button>

          <button
            onClick={() => { setDamSubView('shared'); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              damSubView === 'shared'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>اشتراک‌گذاری‌شده ({sharedCount})</span>
          </button>

          <button
            onClick={() => { setDamSubView('projects'); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              damSubView === 'projects'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>پروژه‌ها</span>
          </button>

          <button
            onClick={() => { setDamSubView('favorites'); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              damSubView === 'favorites'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>علاقه‌مندی‌ها</span>
          </button>

          <button
            onClick={() => { setDamSubView('trash'); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              damSubView === 'trash'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>سطل زباله ({trashCount})</span>
          </button>
        </div>

        {/* View Switcher (Grid / List) & Sort */}
        <div className="flex items-center gap-2">
          {damSubView === 'trash' && trashCount > 0 && (
            <button
              onClick={() => {
                if (confirm('آیا از حذف دائمی تمام موارد موجود در سطل زباله اطمینان دارید؟ این عمل غیرقابل بازگشت است.')) {
                  emptyTrash();
                }
              }}
              className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>تخلیه کامل سطل زباله</span>
            </button>
          )}

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-600" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-slate-700 font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="updatedAt">آخرین تغییرات</option>
              <option value="title">نام فایل (الفبا)</option>
              <option value="size">حجم فایل</option>
              <option value="downloads">تعداد دانلودها</option>
            </select>
          </div>

          {/* Grid/List Buttons */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:text-slate-700'
              }`}
              title="نمای شبکه‌ای (Grid)"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:text-slate-700'
              }`}
              title="نمای جدولی و لیستی (List)"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Pills Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            selectedCategory === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>همه فرمت‌ها</span>
        </button>

        <button
          onClick={() => setSelectedCategory('image')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            selectedCategory === 'image'
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
          <span>تصاویر (Images)</span>
        </button>

        <button
          onClick={() => setSelectedCategory('video')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            selectedCategory === 'video'
              ? 'bg-purple-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-purple-500" />
          <span>ویدئوها (Videos)</span>
        </button>

        <button
          onClick={() => setSelectedCategory('audio')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            selectedCategory === 'audio'
              ? 'bg-amber-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Music className="w-3.5 h-3.5 text-amber-500" />
          <span>صوت و پادکست (Audio)</span>
        </button>

        <button
          onClick={() => setSelectedCategory('document')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            selectedCategory === 'document'
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span>اسناد و PDF (Docs)</span>
        </button>

        <button
          onClick={() => setSelectedCategory('archive')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            selectedCategory === 'archive'
              ? 'bg-orange-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Archive className="w-3.5 h-3.5 text-orange-500" />
          <span>بسته‌های فشرده (ZIP)</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در عنوان دارایی، نام فایل، برچسب‌ها (#UI, #Branding)..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-900 placeholder:text-slate-600 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
          />
        </div>

        {/* Project Filter */}
        <div className="w-full sm:w-56">
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden"
          >
            <option value="all">📁 تمام پروژه‌ها</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Uploader Filter */}
        <div className="w-full sm:w-48">
          <select
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden"
          >
            <option value="all">👤 تمام بارگذاری‌کنندگان</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Breadcrumbs (When navigating folders) */}
      {currentFolderId && (
        <div className="flex items-center gap-2 p-3 bg-white rounded-2xl border border-slate-200/80 text-xs text-slate-700">
          <button
            onClick={() => setCurrentFolderId(null)}
            className="font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>ریشه دارایی‌ها (Root)</span>
          </button>

          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={b.id}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 rotate-180" />
              {idx === breadcrumbs.length - 1 ? (
                <span className="font-black text-slate-900">{b.name}</span>
              ) : (
                <button
                  onClick={() => setCurrentFolderId(b.id)}
                  className="font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  {b.name}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Multi-Select Floating Action Bar */}
      {selectedAssetIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-4 animate-in fade-in slide-in-from-bottom duration-200">
          <span className="text-xs font-bold text-indigo-300">
            {selectedAssetIds.length} فایل انتخاب شده
          </span>

          <div className="w-px h-4 bg-slate-700" />

          {/* Batch Actions */}
          <div className="flex items-center gap-2 text-xs">
            {damSubView === 'trash' ? (
              <button
                onClick={handleBatchRestore}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بازیابی موارد</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleBatchDelete}
                  className="px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف به سطل</span>
                </button>

                {/* Move Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowMoveDropdown(!showMoveDropdown)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-400" />
                    <span>انتقال به پوشه...</span>
                  </button>

                  {showMoveDropdown && (
                    <div className="absolute bottom-full mb-2 left-0 w-52 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 animate-in fade-in">
                      <p className="text-[10px] font-bold text-slate-600 px-2 py-1">انتخاب پوشه مقصد:</p>
                      <button
                        onClick={() => handleBatchMove(null)}
                        className="w-full text-right px-2 py-1.5 hover:bg-slate-100 rounded-lg text-xs font-medium"
                      >
                        📁 ریشه (Root)
                      </button>
                      {folders.map(f => (
                        <button
                          key={f.id}
                          onClick={() => handleBatchMove(f.id)}
                          className="w-full text-right px-2 py-1.5 hover:bg-slate-100 rounded-lg text-xs font-medium truncate"
                        >
                          📁 {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <button
              onClick={() => setSelectedAssetIds([])}
              className="px-3 py-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              لغو انتخاب
            </button>
          </div>
        </div>
      )}

      {/* Folders Section (When in folders or root) */}
      {currentSubFolders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Folder className="w-4 h-4 text-amber-500" />
              <span>پوشه‌ها ({currentSubFolders.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {currentSubFolders.map(folder => (
              <FolderCard key={folder.id} folder={folder} />
            ))}
          </div>
        </div>
      )}

      {/* Assets Listing Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>دارایی‌ها و فایل‌ها ({filteredAssets.length})</span>
          </h3>

          {filteredAssets.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
            >
              {selectedAssetIds.length === filteredAssets.length ? 'عدم انتخاب همه' : 'انتخاب همه فایل‌ها'}
            </button>
          )}
        </div>

        {/* Empty State */}
        {filteredAssets.length === 0 && currentSubFolders.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-base text-slate-900">هیچ دارایی یا فایلی یافت نشد</h4>
            <p className="text-xs text-slate-600 max-w-md mt-1 mb-6">
              با معیارهای فیلتر یا جستجوی فعلی موردی پیدا نشد، یا هنوز فایلی در این بخش بارگذاری نشده است.
            </p>
            <button
              onClick={() => setIsUploadAssetOpen(true)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>بارگذاری اولین فایل در این بخش</span>
            </button>
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && filteredAssets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredAssets.map(asset => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={selectedAssetIds.includes(asset.id)}
                onToggleSelect={() => handleToggleSelectAsset(asset.id)}
              />
            ))}
          </div>
        )}

        {/* List / Table View */}
        {viewMode === 'list' && filteredAssets.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.length === filteredAssets.length && filteredAssets.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">نام و مشخصات فایل</th>
                    <th className="py-3 px-3">پروژه مرتبط</th>
                    <th className="py-3 px-3">سطح دسترسی</th>
                    <th className="py-3 px-3">حجم</th>
                    <th className="py-3 px-3">تاریخ آخرین تغییر</th>
                    <th className="py-3 px-3">مالک / بارگذار</th>
                    <th className="py-3 px-3 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map(asset => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      isSelected={selectedAssetIds.includes(asset.id)}
                      onToggleSelect={() => handleToggleSelectAsset(asset.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Mount All DAM Modals and Drawers */}
    </div>
  );
};
