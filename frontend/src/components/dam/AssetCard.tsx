import React, { useState } from 'react';
import { DigitalAsset } from '../../types';
import { useApp } from '../../context/AppContext';
import { AssetThumbnail } from './AssetThumbnail';
import { 
  MoreVertical, 
  Star, 
  Download, 
  Eye, 
  Info, 
  Share2, 
  History, 
  Trash2, 
  RotateCcw,
  Check,
  Tag,
  Briefcase,
  Layers,
  Edit
} from 'lucide-react';

interface AssetCardProps {
  asset: DigitalAsset;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  isSelected = false,
  onToggleSelect
}) => {
  const {
    setPreviewAssetId,
    setDetailAssetId,
    setVersionModalAssetId,
    setShareTargetAssetId,
    openEditAsset,
    toggleAssetFavorite,
    deleteAsset,
    restoreAsset,
    downloadAsset,
    projects
  } = useApp();

  const [showMenu, setShowMenu] = useState(false);
  const linkedProject = projects.find(p => p.id === asset.projectId);

  const handleCardClick = (e: React.MouseEvent) => {
    // If shift/ctrl or if clicked on checkbox, don't open preview
    if (e.target instanceof HTMLInputElement) return;
    setPreviewAssetId(asset.id);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-3xl bg-white border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col hover:shadow-md hover:border-indigo-300 ${
        isSelected 
          ? 'ring-2 ring-indigo-500 bg-indigo-50/10 border-indigo-400' 
          : 'border-slate-200/80 shadow-2xs'
      }`}
    >
      {/* Top Header Controls Overlay (Checkbox & Actions) */}
      <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
        {/* Selection Checkbox */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
            isSelected 
              ? 'bg-indigo-600 text-white shadow-xs' 
              : 'bg-white/90 backdrop-blur-xs text-transparent border border-slate-300 hover:border-indigo-400 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
        </div>

        {/* Favorite & Quick Menu */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleAssetFavorite(asset.id);
            }}
            title={asset.isFavorite ? 'حذف از نشان‌شده‌ها' : 'نشان کردن فایل'}
            className={`p-1.5 rounded-lg backdrop-blur-xs transition-colors cursor-pointer ${
              asset.isFavorite 
                ? 'bg-white/90 text-amber-500 shadow-xs' 
                : 'bg-white/80 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 hover:bg-white'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${asset.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>

          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg bg-white/90 backdrop-blur-xs text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-xs"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                <div className="absolute left-0 mt-1 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs text-slate-700 animate-in fade-in zoom-in-95">
                  <button
                    onClick={() => {
                      setPreviewAssetId(asset.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    <span>پیش‌نمایش فایل</span>
                  </button>
                  <button
                    onClick={() => {
                      openEditAsset(asset);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold text-indigo-600"
                  >
                    <Edit className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ویرایش اطلاعات و پروژه</span>
                  </button>
                  <button
                    onClick={() => {
                      setDetailAssetId(asset.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <Info className="w-3.5 h-3.5 text-blue-600" />
                    <span>مشاهده جزئیات و لاگ</span>
                  </button>
                  <button
                    onClick={() => {
                      downloadAsset(asset);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>دانلود فایل</span>
                  </button>
                  <button
                    onClick={() => {
                      setShareTargetAssetId(asset.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <Share2 className="w-3.5 h-3.5 text-purple-600" />
                    <span>مدیریت دسترسی و اشتراک</span>
                  </button>
                  <button
                    onClick={() => {
                      setVersionModalAssetId(asset.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <History className="w-3.5 h-3.5 text-amber-600" />
                    <span>مدیریت نسخه‌ها ({asset.versions?.length || 1})</span>
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  {asset.isTrash ? (
                    <button
                      onClick={() => {
                        restoreAsset(asset.id);
                        setShowMenu(false);
                      }}
                      className="w-full text-right px-3.5 py-2 hover:bg-emerald-50 text-emerald-600 flex items-center gap-2 font-bold"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                      <span>بازیابی از زباله‌دان</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        deleteAsset(asset.id);
                        setShowMenu(false);
                      }}
                      className="w-full text-right px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>انتقال به سطل زباله</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail */}
      <AssetThumbnail asset={asset} size="full" showCategoryBadge />

      {/* Body Content */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            {asset.currentVersion > 1 && (
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[9px] font-mono font-bold flex items-center gap-0.5">
                <Layers className="w-2.5 h-2.5" />
                <span>v{asset.currentVersion}</span>
              </span>
            )}
            <span className="text-[10px] font-mono text-slate-600 uppercase font-semibold">
              {asset.extension}
            </span>
          </div>

          <h4 className="font-bold text-slate-800 text-xs leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors" title={asset.title}>
            {asset.title}
          </h4>
        </div>

        {/* Footer Meta */}
        <div className="mt-3 pt-2.5 border-t border-slate-100/90 flex flex-col gap-1.5 text-[11px] text-slate-600">
          <div className="flex items-center justify-between">
            <span className="font-medium font-mono">{asset.sizeFormatted}</span>
            <span className="text-[10px] text-slate-600 font-mono">{asset.updatedAt.split(' - ')[0]}</span>
          </div>

          {linkedProject && (
            <div className="flex items-center gap-1 text-[10px] text-indigo-700 font-medium truncate bg-indigo-50/60 px-2 py-0.5 rounded-md">
              <Briefcase className="w-3 h-3 text-indigo-600 shrink-0" />
              <span className="truncate">{linkedProject.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
