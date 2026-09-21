import React, { useState } from 'react';
import { DigitalAsset } from '../../types';
import { useApp } from '../../context/AppContext';
import { AssetThumbnail } from './AssetThumbnail';
import { Avatar } from '../common/Avatar';
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
  Layers,
  Globe,
  Lock,
  Users,
  Briefcase,
  Edit
} from 'lucide-react';

interface AssetRowProps {
  asset: DigitalAsset;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const AssetRow: React.FC<AssetRowProps> = ({
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
    projects,
    users
  } = useApp();

  const [showMenu, setShowMenu] = useState(false);
  const linkedProject = projects.find(p => p.id === asset.projectId);
  const creator = users.find(u => u.id === asset.createdBy);

  const getPermissionBadge = () => {
    switch (asset.permissionLevel) {
      case 'organization':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Globe className="w-2.5 h-2.5" />
            <span>سازمانی</span>
          </span>
        );
      case 'project':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Briefcase className="w-2.5 h-2.5" />
            <span>پروژه</span>
          </span>
        );
      case 'team':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Users className="w-2.5 h-2.5" />
            <span>تیمی</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Lock className="w-2.5 h-2.5" />
            <span>شخصی</span>
          </span>
        );
    }
  };

  return (
    <tr
      onClick={() => setPreviewAssetId(asset.id)}
      className={`group border-b border-slate-100/80 hover:bg-indigo-50/30 transition-colors cursor-pointer text-xs ${
        isSelected ? 'bg-indigo-50/50' : ''
      }`}
    >
      {/* Checkbox */}
      <td className="py-3 px-3 w-10 text-center" onClick={e => e.stopPropagation()}>
        <button
          onClick={onToggleSelect}
          className={`w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer ${
            isSelected 
              ? 'bg-indigo-600 text-white' 
              : 'border border-slate-300 hover:border-indigo-500 bg-white'
          }`}
        >
          {isSelected && <Check className="w-3.5 h-3.5" />}
        </button>
      </td>

      {/* Title & Preview */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-3">
          <AssetThumbnail asset={asset} size="sm" />
          <div className="min-w-0 max-w-md">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                {asset.title}
              </span>
              {asset.currentVersion > 1 && (
                <span className="px-1.5 py-0.2 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[9px] font-mono font-bold shrink-0">
                  v{asset.currentVersion}
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-slate-600 truncate mt-0.5">
              {asset.fileName}
            </p>
          </div>
        </div>
      </td>

      {/* Associated Project */}
      <td className="py-3 px-3 text-slate-600">
        {linkedProject ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-100">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: linkedProject.color }} />
            <span className="truncate max-w-32">{linkedProject.name}</span>
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>

      {/* Permission Level */}
      <td className="py-3 px-3">
        {getPermissionBadge()}
      </td>

      {/* Size */}
      <td className="py-3 px-3 font-semibold text-slate-700 font-mono whitespace-nowrap">
        {asset.sizeFormatted}
      </td>

      {/* Last Modified */}
      <td className="py-3 px-3 text-slate-600 font-mono whitespace-nowrap">
        {asset.updatedAt}
      </td>

      {/* Owner / Creator */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <Avatar user={creator} size="xs" />
          <span className="text-slate-700 font-semibold truncate max-w-24">{creator?.name || 'نامشخص'}</span>
        </div>
      </td>

      {/* Action Buttons */}
      <td className="py-3 px-3 text-left whitespace-nowrap" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => openEditAsset(asset)}
            title="ویرایش اطلاعات و متادیتا"
            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
          >
            <Edit className="w-4 h-4" />
          </button>

          <button
            onClick={() => toggleAssetFavorite(asset.id)}
            title={asset.isFavorite ? 'حذف از نشان‌ها' : 'نشان کردن'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              asset.isFavorite ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-600 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Star className={`w-4 h-4 ${asset.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>

          <button
            onClick={() => downloadAsset(asset)}
            title="دانلود فایل"
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
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
                      setShareTargetAssetId(asset.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <Share2 className="w-3.5 h-3.5 text-purple-600" />
                    <span>مدیریت اشتراک‌گذاری</span>
                  </button>
                  <button
                    onClick={() => {
                      setVersionModalAssetId(asset.id);
                      setShowMenu(false);
                    }}
                    className="w-full text-right px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 font-semibold"
                  >
                    <History className="w-3.5 h-3.5 text-amber-600" />
                    <span>مدیریت نسخه‌ها</span>
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
                      <span>بازیابی فایل</span>
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
      </td>
    </tr>
  );
};
