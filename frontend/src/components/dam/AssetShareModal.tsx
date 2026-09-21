import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  Globe, 
  Lock, 
  Users, 
  Briefcase, 
  ShieldCheck, 
  UserPlus,
  Trash2,
  Building2,
  FolderLock
} from 'lucide-react';
import { AssetPermissionLevel, AssetAccessRight } from '../../types';

export const AssetShareModal: React.FC = () => {
  const {
    shareTargetAssetId,
    setShareTargetAssetId,
    shareTargetFolderId,
    setShareTargetFolderId,
    assets,
    folders,
    shareAsset,
    removeAssetShare,
    updateAsset,
    users,
    teams
  } = useApp();

  const [copied, setCopied] = useState(false);
  const [selectedTargetType, setSelectedTargetType] = useState<'user' | 'team'>('user');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [accessRight, setAccessRight] = useState<AssetAccessRight>('view');

  const asset = assets.find(a => a.id === shareTargetAssetId);
  const folder = folders.find(f => f.id === shareTargetFolderId);

  if (!shareTargetAssetId && !shareTargetFolderId) return null;

  const targetTitle = asset ? asset.title : folder?.name;
  const isAsset = Boolean(asset);

  const handleCopyLink = () => {
    const link = `https://tadbir.system/assets/view?id=${shareTargetAssetId || shareTargetFolderId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddShare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) return;

    if (asset) {
      const targetUser = users.find(u => u.id === selectedTargetId);
      const targetTeam = teams.find(t => t.id === selectedTargetId);
      const targetName = targetUser?.name || targetTeam?.name || 'مخاطب';

      shareAsset(asset.id, {
        targetId: selectedTargetId,
        targetType: selectedTargetType,
        access: accessRight,
        targetName
      });
      setSelectedTargetId('');
    }
  };

  const handleRemoveShare = (targetId: string) => {
    if (asset) {
      removeAssetShare(asset.id, targetId);
    }
  };

  const handlePermissionLevelChange = (level: AssetPermissionLevel) => {
    if (asset) {
      updateAsset(asset.id, { permissionLevel: level });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 text-right" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">مدیریت دسترسی و اشتراک‌گذاری</h3>
              <p className="text-xs text-slate-500 truncate max-w-sm">{targetTitle}</p>
            </div>
          </div>

          <button
            onClick={() => {
              setShareTargetAssetId(null);
              setShareTargetFolderId(null);
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Shareable Link Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">لینک اختصاصی سامانه تدبیر:</label>
            <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-2xl">
              <input
                type="text"
                readOnly
                value={`https://tadbir.system/assets/view?id=${shareTargetAssetId || shareTargetFolderId}`}
                className="flex-1 bg-transparent px-2 text-xs font-mono text-slate-600 focus:outline-hidden text-left"
                dir="ltr"
              />
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'کپی شد!' : 'کپی لینک'}</span>
              </button>
            </div>
          </div>

          {/* General Permission Scope */}
          {isAsset && asset && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <label className="text-xs font-bold text-slate-900 block">سطح دسترسی عمومی فایل:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handlePermissionLevelChange('organization')}
                  className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2 cursor-pointer ${
                    asset.permissionLevel === 'organization'
                      ? 'border-indigo-500 bg-indigo-50/70 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <Globe className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block font-bold">کل سازمان</span>
                    <span className="text-[10px] text-slate-500">همه کاربران تدبیر</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePermissionLevelChange('project')}
                  className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2 cursor-pointer ${
                    asset.permissionLevel === 'project'
                      ? 'border-indigo-500 bg-indigo-50/70 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <Briefcase className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block font-bold">اعضای پروژه</span>
                    <span className="text-[10px] text-slate-500">پروژه مرتبط با فایل</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePermissionLevelChange('team')}
                  className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2 cursor-pointer ${
                    asset.permissionLevel === 'team'
                      ? 'border-indigo-500 bg-indigo-50/70 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block font-bold">تیم کاری</span>
                    <span className="text-[10px] text-slate-500">اعضای تیم مشخص</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePermissionLevelChange('private')}
                  className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2 cursor-pointer ${
                    asset.permissionLevel === 'private'
                      ? 'border-indigo-500 bg-indigo-50/70 text-indigo-900 font-bold'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                  }`}
                >
                  <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block font-bold">خصوصی / محدود</span>
                    <span className="text-[10px] text-slate-500">فقط افراد مجاز لیست زیر</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Add User / Team Form */}
          {isAsset && (
            <form onSubmit={handleAddShare} className="space-y-3 pt-2 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-purple-600" />
                <span>اشتراک با همکار یا تیم کاری</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={selectedTargetType}
                  onChange={(e) => {
                    setSelectedTargetType(e.target.value as 'user' | 'team');
                    setSelectedTargetId('');
                  }}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-hidden cursor-pointer"
                >
                  <option value="user">👤 کاربر مشخص</option>
                  <option value="team">👥 کل تیم</option>
                </select>

                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  required
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-hidden sm:col-span-2 cursor-pointer"
                >
                  <option value="">
                    {selectedTargetType === 'user' ? 'انتخاب همکار...' : 'انتخاب تیم کاری...'}
                  </option>
                  {selectedTargetType === 'user'
                    ? users.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.title || u.role})</option>
                      ))
                    : teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.members.length} عضو)</option>
                      ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={accessRight}
                  onChange={(e) => setAccessRight(e.target.value as AssetAccessRight)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-hidden cursor-pointer"
                >
                  <option value="view">فقط مشاهده و دانلود (View)</option>
                  <option value="comment">مشاهده و ثبت دیدگاه (Comment)</option>
                  <option value="edit">ویرایش و بارگذاری نسخه (Edit)</option>
                  <option value="admin">مدیریت کامل و حذف (Admin)</option>
                </select>

                <button
                  type="submit"
                  disabled={!selectedTargetId}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                >
                  اعمال دسترسی
                </button>
              </div>
            </form>
          )}

          {/* Currently Shared List */}
          {isAsset && asset && asset.sharedWith && asset.sharedWith.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                افراد و تیم‌های دارای دسترسی مستقیم ({asset.sharedWith.length})
              </h4>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {asset.sharedWith.map((sw, idx) => {
                  const targetUser = sw.targetType === 'user' ? users.find(u => u.id === sw.targetId) : undefined;
                  const targetTeam = sw.targetType === 'team' ? teams.find(t => t.id === sw.targetId) : undefined;
                  const name = sw.targetName || targetUser?.name || targetTeam?.name || 'مخاطب';

                  return (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        {sw.targetType === 'user' ? (
                          <Avatar user={targetUser} size="xs" />
                        ) : (
                          <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div>
                          <span className="font-bold text-slate-800 block">{name}</span>
                          <span className="text-[10px] text-slate-400">
                            {sw.targetType === 'user' ? 'کاربر' : 'تیم سازمانی'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[10px] font-bold">
                          {sw.access === 'admin' ? 'مدیریت تام' : sw.access === 'edit' ? 'ویرایشگر' : sw.access === 'comment' ? 'دیدگاه‌گذار' : 'فقط مشاهده'}
                        </span>

                        <button
                          onClick={() => handleRemoveShare(sw.targetId)}
                          title="حذف دسترسی"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex justify-end">
          <button
            onClick={() => {
              setShareTargetAssetId(null);
              setShareTargetFolderId(null);
            }}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
