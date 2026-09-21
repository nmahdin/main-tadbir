import { getContentStatusBadge } from '../../utils/statusBadges';
import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { CreateContentModal } from './CreateContentModal';
import { EditContentModal } from './EditContentModal';
import { Content, ContentStatus } from '../../types';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Video, 
  Image as ImageIcon,
  Mic,
  Layout,
  Clock,
  CheckCircle2,
  AlertCircle,
  Edit3
} from 'lucide-react';

export const ContentMainView: React.FC = () => {
  const { contents, departments, users, setActiveView, setSelectedContentId, hasPermission } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [contentToEdit, setContentToEdit] = useState<Content | null>(null);

  
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
      case 'motion': return <Video className="w-4 h-4 text-rose-500" />;
      case 'photo':
      case 'poster': return <ImageIcon className="w-4 h-4 text-emerald-500" />;
      case 'podcast':
      case 'interview': return <Mic className="w-4 h-4 text-purple-500" />;
      case 'article':
      case 'news':
      case 'report': return <FileText className="w-4 h-4 text-blue-500" />;
      default: return <Layout className="w-4 h-4 text-slate-500" />;
    }
  };

  const filteredContents = contents.filter(c => {
    const matchesSearch = c.title.includes(searchTerm) || (c.topic && c.topic.includes(searchTerm));
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenContent = (id: string) => {
    setSelectedContentId(id);
    setActiveView('content-detail');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">مدیریت و تولید محتوا</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">چرخه ایده‌پردازی، تولید رسانه‌ای، بازبینی و آماده‌سازی انتشار</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {hasPermission('content.create') && <button
            onClick={() => setActiveView('content-publishing')}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Clock className="w-4 h-4 text-indigo-600" />
            تقویم و میز انتشار
          </button>}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            محتوای جدید
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3 bg-slate-50/50">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="جستجو در عناوین و موضوعات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ContentStatus | 'all')}
              className="flex-1 sm:w-48 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="idea">ایده اولیه</option>
              <option value="planning">برنامه‌ریزی</option>
              <option value="producing">در حال تولید</option>
              <option value="reviewing">در انتظار بازبینی</option>
              <option value="revising">نیازمند اصلاح</option>
              <option value="approving">در انتظار تأیید</option>
              <option value="approved">تأییدشده</option>
              <option value="ready_to_publish">آماده انتشار</option>
              <option value="published">منتشرشده</option>
              <option value="in_progress">در حال انجام</option>
              <option value="completed">انجام شده</option>
              <option value="suspended">تعلیق</option>
              <option value="cancelled">لغو شده</option>
            </select>
          </div>
        </div>

        {/* Content List */}
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 whitespace-nowrap">عنوان محتوا</th>
                <th className="p-4 whitespace-nowrap">وضعیت</th>
                <th className="p-4 whitespace-nowrap">دپارتمان</th>
                <th className="p-4 whitespace-nowrap">مسئول اصلی</th>
                <th className="p-4 whitespace-nowrap">مهلت / انتشار</th>
                <th className="p-4 w-28 whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-sm">
                    هیچ محتوایی یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredContents.map(content => {
                  const dept = departments.find(d => d.id === content.departmentId);
                  const owner = users.find(u => u.id === content.ownerId);
                  
                  return (
                    <tr 
                      key={content.id} 
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      onClick={() => handleOpenContent(content.id)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                            {getTypeIcon(content.type)}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {content.title}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">
                              {content.topic || 'بدون موضوع اختصاصی'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {getContentStatusBadge(content.status)}
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-medium text-slate-700">
                          {dept?.name || 'دپارتمان رسانه'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {owner ? (
                            <>
                              <img src={owner.avatar} alt={owner.name} className="w-6 h-6 rounded-full object-cover" />
                              <span className="text-xs font-medium text-slate-700">{owner.name}</span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">نامشخص</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          {content.deadline && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              مهلت: {formatPersianDate(content.deadline)}
                            </div>
                          )}
                          {content.publishInfo?.date && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              انتشار: {formatPersianDate(content.publishInfo.date)} {content.publishInfo.time ? `(${content.publishInfo.time})` : ''}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-left">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setContentToEdit(content);
                          }}
                          title="ویرایش محتوا"
                          className="px-3 py-2 rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                        >
                          <Edit3 className="w-4 h-4" />
                          <span>ویرایش</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateContentModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <EditContentModal
        isOpen={contentToEdit !== null}
        onClose={() => setContentToEdit(null)}
        content={contentToEdit}
      />
    </div>
  );
};
