import React, { useState } from 'react';
import { DigitalAsset, AssetCategory } from '../../types';
import { 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Music, 
  Archive, 
  FileCode, 
  FileSpreadsheet,
  FileCheck,
  File
} from 'lucide-react';

interface AssetThumbnailProps {
  asset: DigitalAsset;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCategoryBadge?: boolean;
}

export const getCategoryIcon = (category: AssetCategory, extension: string, className: string = 'w-6 h-6') => {
  const ext = extension.toLowerCase();
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return <FileSpreadsheet className={`${className} text-emerald-600`} />;
  }
  if (['pdf'].includes(ext)) {
    return <FileCheck className={`${className} text-rose-600`} />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py'].includes(ext)) {
    return <FileCode className={`${className} text-amber-600`} />;
  }

  switch (category) {
    case 'image':
      return <ImageIcon className={`${className} text-indigo-600`} />;
    case 'video':
      return <Video className={`${className} text-purple-600`} />;
    case 'audio':
      return <Music className={`${className} text-amber-600`} />;
    case 'document':
      return <FileText className={`${className} text-blue-600`} />;
    case 'archive':
      return <Archive className={`${className} text-orange-600`} />;
    default:
      return <File className={`${className} text-slate-500`} />;
  }
};

export const getCategoryColor = (category: AssetCategory) => {
  switch (category) {
    case 'image':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
    case 'video':
      return 'bg-purple-50 text-purple-700 border-purple-200/80';
    case 'audio':
      return 'bg-amber-50 text-amber-700 border-amber-200/80';
    case 'document':
      return 'bg-blue-50 text-blue-700 border-blue-200/80';
    case 'archive':
      return 'bg-orange-50 text-orange-700 border-orange-200/80';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const AssetThumbnail: React.FC<AssetThumbnailProps> = ({
  asset,
  size = 'md',
  showCategoryBadge = false
}) => {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'w-10 h-10 rounded-lg',
    md: 'w-14 h-14 rounded-xl',
    lg: 'w-24 h-24 rounded-2xl',
    xl: 'w-36 h-36 rounded-2xl',
    full: 'w-full h-44 rounded-t-2xl'
  }[size];

  const hasImagePreview = Boolean(
    !imageError && 
    (asset.thumbnailUrl || (asset.category === 'image' && asset.url && asset.url !== '#'))
  );

  return (
    <div className={`relative overflow-hidden flex items-center justify-center bg-slate-100/90 border border-slate-200/60 shrink-0 ${sizeClasses}`}>
      {hasImagePreview ? (
        <img
          src={asset.thumbnailUrl || asset.url}
          alt={asset.title}
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-2 text-center">
          {getCategoryIcon(
            asset.category, 
            asset.extension, 
            size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-7 h-7' : 'w-10 h-10'
          )}
          {size !== 'sm' && (
            <span className="text-[10px] font-bold font-mono uppercase text-slate-500 mt-1">
              .{asset.extension}
            </span>
          )}
        </div>
      )}

      {/* Category Badge if requested */}
      {showCategoryBadge && (
        <span className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold font-mono uppercase border shadow-xs backdrop-blur-xs ${getCategoryColor(asset.category)}`}>
          {asset.extension}
        </span>
      )}
    </div>
  );
};
