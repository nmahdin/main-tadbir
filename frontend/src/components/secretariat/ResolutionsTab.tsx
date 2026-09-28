import React, { useState } from 'react';
import { 
  Award, 
  Plus, 
  CheckCircle2, 
  Clock, 
  CheckSquare, 
  Trash2, 
  Search,
  ExternalLink,
  Calendar,
  Building
} from 'lucide-react';
import { SecretariatResolution } from '../../types';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';

interface ResolutionsTabProps {
  onOpenCreateModal: () => void;
}

export const ResolutionsTab: React.FC<ResolutionsTabProps> = ({ onOpenCreateModal }) => {
  const { 
    secretariatResolutions, 
    users, 
    projects, 
    updateResolution, 
    deleteResolution, 
    convertResolutionToTask,
    hasPermission 
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<string>(projects[0]?.id || '');

  const filteredResolutions = secretariatResolutions.filter(res => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      res.title.toLowerCase().includes(q) ||
      res.resolutionNumber.toLowerCase().includes(q) ||
      res.content.toLowerCase().includes(q) ||
      res.meetingNumber.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-amber-950 text-white p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-amber-300 text-xs font-bold">
            <Award className="w-4 h-4" />
            <span>مصوبات هیئت مدیره و مدیریت ارشد</span>
          </div>
          <h2 className="text-lg font-bold">دفتر ثبت مصوبات و تصمیمات کلان سازمانی</h2>
          <p className="text-xs text-slate-300 mt-1">
            پیگیری اجرای مصوبات، تعیین مسئولین پاسخگو و تبدیل مستقیم بندهای مصوب به وظایف و پروژه‌ها
          </p>
        </div>

        {hasPermission('secretariat_create') && (
          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت مصوبه جدید</span>
          </button>
        )}
      </div>

      {/* Search & Counter */}
      <div className="flex items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در متن یا شماره مصوبات..."
            className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>

        <div className="text-xs text-slate-500">
          تعداد: <span className="font-bold text-slate-800">{filteredResolutions.length}</span> مصوبه
        </div>
      </div>

      {/* Resolutions List */}
      <div className="space-y-4">
        {filteredResolutions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
            مصوبه‌ای یافت نشد.
          </div>
        ) : (
          filteredResolutions.map((res) => {
            const responsible = users.find(u => u.id === res.responsibleUserId);

            return (
              <div 
                key={res.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4 hover:border-amber-300/80 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-amber-50 text-amber-900 border border-amber-200">
                      {res.resolutionNumber}
                    </span>
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded">
                      {res.meetingNumber}
                    </span>
                    <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                      {res.date}
                    </span>
                  </div>

                  {/* Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">وضعیت اجرا:</span>
                    <select
                      value={res.status}
                      onChange={(e) => updateResolution(res.id, { status: e.target.value as any })}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                        res.status === 'executed'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : res.status === 'in_progress'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      <option value="pending">در انتظار اقدام</option>
                      <option value="in_progress">در حال اجرا و پیگیری</option>
                      <option value="executed">اجرا شده و خاتمه یافته</option>
                      <option value="cancelled">کان‌لم‌یکن / لغو شده</option>
                    </select>
                  </div>
                </div>

                {/* Title & Body */}
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{res.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/60">
                    {res.content}
                  </p>
                </div>

                {/* Footer details & Convert to Task */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 text-xs">
                  <div className="flex items-center gap-4 text-slate-500">
                    {responsible && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">مسئول اجرا:</span>
                        <Avatar user={responsible} size="xs" />
                        <span className="font-bold text-slate-800">{responsible.name}</span>
                      </div>
                    )}

                    {res.executionDeadline && (
                      <div className="flex items-center gap-1 text-amber-700 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        مهلت اجرا: {res.executionDeadline}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {res.convertedTaskId ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        به عنوان Task در پروژه ثبت شد
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedTaskProjectId}
                          onChange={(e) => setSelectedTaskProjectId(e.target.value)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => convertResolutionToTask(res.id, selectedTaskProjectId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          تبدیل به Task
                        </button>
                      </div>
                    )}

                    {hasPermission('secretariat_delete') && (
                      <button
                        onClick={() => {
                          if (confirm(`آیا از حذف مصوبه «${res.resolutionNumber}» اطمینان دارید؟`)) {
                            deleteResolution(res.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="حذف مصوبه"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
