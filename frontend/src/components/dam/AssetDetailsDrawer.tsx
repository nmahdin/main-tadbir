import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AssetThumbnail } from './AssetThumbnail';
import { Avatar } from '../common/Avatar';
import { 
  X, 
  Download, 
  Trash2, 
  Star, 
  Share2, 
  History, 
  Layers, 
  Tag, 
  Briefcase, 
  CheckSquare, 
  Folder, 
  Globe, 
  Lock, 
  Users, 
  Calendar, 
  Clock, 
  FileText, 
  MessageSquare, 
  Send, 
  Plus, 
  CheckCircle2, 
  File, 
  Info,
  RotateCcw,
  Sparkles,
  Edit
} from 'lucide-react';
import { AssetPermissionLevel } from '../../types';

export const AssetDetailsDrawer: React.FC = () => {
  const {
    detailAssetId,
    setDetailAssetId,
    assets,
    updateAsset,
    deleteAsset,
    restoreAsset,
    downloadAsset,
    toggleAssetFavorite,
    openEditAsset,
    setVersionModalAssetId,
    setShareTargetAssetId,
    addAssetComment,
    deleteAssetVersion,
    revertToAssetVersion,
    folders,
    projects,
    tasks,
    users,
    currentUser
  } = useApp();

  const [activeTab, setActiveTab] = useState<'info' | 'versions' | 'comments' | 'activity'>('info');
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');

  if (!detailAssetId) return null;

  const asset = assets.find(a => a.id === detailAssetId);
  if (!asset) return null;

  const creator = users.find(u => u.id === asset.createdBy);
  const project = projects.find(p => p.id === asset.projectId);
  const task = tasks.find(t => t.id === asset.taskId);
  const folder = folders.find(f => f.id === asset.folderId);

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    const cleanTag = newTagInput.trim();
    if (!asset.tags.includes(cleanTag)) {
      updateAsset(asset.id, { tags: [...asset.tags, cleanTag] });
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateAsset(asset.id, {
      tags: asset.tags.filter(t => t !== tagToRemove)
    });
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    addAssetComment(asset.id, newCommentText.trim());
    setNewCommentText('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <AssetThumbnail asset={asset} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 truncate" title={asset.title}>
                  {asset.title}
                </h3>
                {asset.currentVersion > 1 && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-mono font-bold">
                    v{asset.currentVersion}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-600 truncate">{asset.fileName}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => openEditAsset(asset)}
              className="p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
              title="ویرایش اطلاعات و پروژه"
            >
              <Edit className="w-4 h-4" />
            </button>

            <button
              onClick={() => toggleAssetFavorite(asset.id)}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                asset.isFavorite ? 'text-amber-500 bg-amber-50' : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="نشان کردن"
            >
              <Star className={`w-4 h-4 ${asset.isFavorite ? 'fill-amber-400' : ''}`} />
            </button>

            <button
              onClick={() => downloadAsset(asset)}
              className="p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
              title="دانلود"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => setDetailAssetId(null)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-200 bg-white flex items-center gap-2">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-2.5 px-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'info'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>مشخصات و ویژگی‌ها</span>
          </button>

          <button
            onClick={() => setActiveTab('versions')}
            className={`pb-2.5 px-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'versions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>نسخه‌ها ({asset.versions?.length || 1})</span>
          </button>

          <button
            onClick={() => setActiveTab('comments')}
            className={`pb-2.5 px-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'comments'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>دیدگاه‌ها ({asset.comments?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-2.5 px-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>لاگ تغییرات</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Properties Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-600 block mb-1">حجم فایل</span>
                  <span className="font-bold text-slate-800">{asset.sizeFormatted}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-600 block mb-1">فرمت و پسوند</span>
                  <span className="font-bold text-slate-800 uppercase font-mono">.{asset.extension}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-600 block mb-1">تعداد دانلود</span>
                  <span className="font-bold text-slate-800">{asset.downloadCount || 0} مرتبه</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-600 block mb-1">تاریخ ایجاد</span>
                  <span className="font-bold text-slate-800">{asset.createdAt}</span>
                </div>
                {asset.dimensions && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] text-slate-600 block mb-1">ابعاد تصویر / فریم</span>
                    <span className="font-bold text-slate-800 font-mono">{asset.dimensions}</span>
                  </div>
                )}
                {asset.duration && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] text-slate-600 block mb-1">مدت زمان پخش</span>
                    <span className="font-bold text-slate-800">{asset.duration}</span>
                  </div>
                )}
              </div>

              {/* Associations (Project, Task, Folder) */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  اتصالات و مکان ذخیره‌سازی
                </h4>

                {/* Folder */}
                <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-amber-500" />
                    <span>پوشه والد:</span>
                  </span>
                  <span className="font-bold text-slate-800">{folder?.name || 'ریشه (Root)'}</span>
                </div>

                {/* Project */}
                <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                    <span>پروژه مرتبط:</span>
                  </span>
                  <span className="font-bold text-slate-800">{project?.name || 'بدون پروژه'}</span>
                </div>

                {/* Task */}
                <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                    <span>تسک متصل:</span>
                  </span>
                  <span className="font-bold text-slate-800">{task?.title || 'بدون تسک'}</span>
                </div>

                {/* Owner */}
                <div className="flex items-center justify-between text-xs pt-1.5">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-purple-500" />
                    <span>بارگذاری‌کننده:</span>
                  </span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Avatar user={creator} size="xs" />
                    <span>{creator?.name || 'نامشخص'}</span>
                  </div>
                </div>
              </div>

              {/* Tags Section */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    <span>برچسب‌ها ({asset.tags.length})</span>
                  </h4>
                  {!isAddingTag && (
                    <button
                      onClick={() => setIsAddingTag(true)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>افزودن برچسب</span>
                    </button>
                  )}
                </div>

                {isAddingTag && (
                  <form onSubmit={handleAddTag} className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="نام برچسب جدید (مانند UI, Branding)..."
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                    >
                      ثبت
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingTag(false)}
                      className="px-2 py-1.5 text-xs text-slate-600"
                    >
                      لغو
                    </button>
                  </form>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {asset.tags.map((tg, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/70 text-xs font-medium"
                    >
                      <span>#{tg}</span>
                      <button
                        onClick={() => handleRemoveTag(tg)}
                        className="p-0.5 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {asset.tags.length === 0 && !isAddingTag && (
                    <span className="text-xs text-slate-600">هیچ برچسبی ثبت نشده است.</span>
                  )}
                </div>
              </div>

              {/* Description */}
              {asset.description && (
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    توضیحات و یادداشت
                  </h4>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {asset.description}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={() => setShareTargetAssetId(asset.id)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>تنظیمات اشتراک‌گذاری</span>
                </button>

                {asset.isTrash ? (
                  <button
                    onClick={() => restoreAsset(asset.id)}
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>بازیابی فایل</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm('آیا مایل به انتقال این دارایی به سطل زباله هستید؟')) {
                        deleteAsset(asset.id);
                        setDetailAssetId(null);
                      }
                    }}
                    className="py-2.5 px-3 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">تاریخچه نسخه‌های فایل</h4>
                  <p className="text-xs text-slate-600">نسخه فعال فعلی: v{asset.currentVersion}</p>
                </div>

                <button
                  onClick={() => setVersionModalAssetId(asset.id)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>بارگذاری نسخه جدید</span>
                </button>
              </div>

              <div className="space-y-3 pt-2">
                {asset.versions.map((ver) => {
                  const verUploader = users.find(u => u.id === ver.uploadedBy);
                  const isCurrent = ver.versionNumber === asset.currentVersion;

                  return (
                    <div
                      key={ver.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isCurrent
                          ? 'bg-indigo-50/30 border-indigo-200 shadow-xs'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold ${
                            isCurrent ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            v{ver.versionNumber}.0
                          </span>
                          <span className="font-bold text-slate-800 text-xs truncate max-w-48">
                            {ver.fileName}
                          </span>
                        </div>

                        <span className="text-[11px] font-mono text-slate-600">{ver.sizeFormatted}</span>
                      </div>

                      {/* Changelog notes */}
                      <p className="text-xs text-slate-600 my-2 leading-relaxed bg-white/70 p-2.5 rounded-xl border border-slate-100">
                        {ver.changelog}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                          <Avatar user={verUploader} size="xs" />
                          <span>{verUploader?.name || 'کاربر'} • {ver.uploadedAt}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => downloadAsset({ ...asset, fileName: ver.fileName, size: ver.size, sizeFormatted: ver.sizeFormatted })}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                            title="دانلود این نسخه"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>دانلود</span>
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => revertToAssetVersion(asset.id, ver.id)}
                              className="text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 cursor-pointer bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200"
                              title="فعال‌سازی این نسخه"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>فعال‌سازی</span>
                            </button>
                          )}

                          {asset.versions.length > 1 && (
                            <button
                              onClick={() => {
                                if (confirm(`آیا از حذف نسخه v${ver.versionNumber} (${ver.fileName}) از سیستم اطمینان دارید؟`)) {
                                  deleteAssetVersion(asset.id, ver.id);
                                }
                              }}
                              className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer p-1 rounded-lg hover:bg-rose-50"
                              title="حذف این نسخه"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {asset.comments.map((c) => {
                  const commentAuthor = users.find(u => u.id === c.userId);
                  return (
                    <div key={c.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar user={commentAuthor} size="xs" />
                          <span className="text-xs font-bold text-slate-900">{commentAuthor?.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-600">{c.createdAt}</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed pr-7">{c.text}</p>
                    </div>
                  );
                })}

                {asset.comments.length === 0 && (
                  <div className="text-center py-8 text-slate-600 text-xs">
                    هنوز دیدگاهی برای این فایل ثبت نشده است. اولین نظر را شما بنویسید!
                  </div>
                )}
              </div>

              {/* Add Comment Input */}
              <form onSubmit={handleCommentSubmit} className="flex gap-2 pt-3 border-t border-slate-200">
                <input
                  type="text"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder={`دیدگاه خود را به عنوان ${currentUser.name} بنویسید...`}
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>ارسال</span>
                </button>
              </form>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-3">
              {asset.activities.map((act) => {
                const actUser = users.find(u => u.id === act.userId);
                return (
                  <div key={act.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <Avatar user={actUser} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900">
                        {actUser?.name || 'کاربر سیستم'}: <span className="font-normal text-slate-700">{act.action}</span>
                      </p>
                      {act.details && (
                        <p className="text-[11px] text-slate-600 mt-0.5 font-mono">{act.details}</p>
                      )}
                      <span className="text-[10px] text-slate-600 block mt-1">{act.timestamp}</span>
                    </div>
                  </div>
                );
              })}

              {asset.activities.length === 0 && (
                <div className="text-center py-8 text-slate-600 text-xs">
                  هیچ لاگی برای این فایل ثبت نشده است.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
