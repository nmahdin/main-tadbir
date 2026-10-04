import React from 'react';
import { ContentStatusBadge } from '../../utils/statusBadges';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { Button, IconButton } from '../common/Primitives';
import {
  FileText,
  Video,
  Image as ImageIcon,
  Mic,
  Layout,
  CheckCircle2,
  Archive,
  Send,
  RotateCcw,
  ArrowRight
} from 'lucide-react';

export const ContentPublishedView: React.FC = () => {
  const {
    contents,
    departments,
    users,
    contentTypes,
    setActiveView,
    setSelectedContentId,
    archiveItem,
    unpublishContent,
    publishingContentIds,
    hasPermission
  } = useApp();

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
      case 'motion': return <Video className="w-4 h-4 text-rose-500" />;
      case 'photo':
      case 'poster': return <ImageIcon className="w-4 h-4 text-emerald-500" />;
      case 'podcast':
      case 'interview': return <Mic className="w-4 h-4 text-indigo-500" />;
      case 'article':
      case 'news':
      case 'report': return <FileText className="w-4 h-4 text-blue-500" />;
      default: return <Layout className="w-4 h-4 text-slate-500" />;
    }
  };

  const publishedContents = contents.filter(content => content.status === 'published');

  const handleOpenContent = (id: string) => {
    setSelectedContentId(id);
    setActiveView('content-detail');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <IconButton label="بازگشت به محتواها" purpose="back" variant="secondary" onClick={() => setActiveView('content')} className="shrink-0"><ArrowRight className="w-5 h-5" /></IconButton>
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-200">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">محتوای منتشرشده</h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              {publishedContents.length} محتوای منتشرشده در سامانه
            </p>
          </div>
        </div>

      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 whitespace-nowrap">عنوان محتوا</th>
                <th className="p-4 whitespace-nowrap">نوع</th>
                <th className="p-4 whitespace-nowrap">وضعیت</th>
                <th className="p-4 whitespace-nowrap">دپارتمان</th>
                <th className="p-4 whitespace-nowrap">مسئول اصلی</th>
                <th className="p-4 whitespace-nowrap">ناشر</th>
                <th className="p-4 whitespace-nowrap">تاریخ انتشار</th>
                <th className="p-4 w-28 whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {publishedContents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-500">هنوز محتوایی منتشر نشده است.</p>
                  </td>
                </tr>
              ) : (
                publishedContents.map(content => {
                  const dept = departments.find(d => d.id === content.departmentId);
                  const owner = users.find(u => u.id === content.ownerId);
                  const typeName = contentTypes.find(ct => ct.id === content.type)?.name || content.type;
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
                            <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                              {content.title}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">
                              {content.topic || 'بدون موضوع اختصاصی'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg whitespace-nowrap">
                          {typeName}
                        </span>
                      </td>
                      <td className="p-4"><ContentStatusBadge status={content.status} /></td>
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
                        {(() => {
                          const publisher = users.find(u => u.id === content.publisherId);
                          return publisher ? (
                            <div className="flex items-center gap-2">
                              <img src={publisher.avatar} alt={publisher.name} className="w-6 h-6 rounded-full object-cover" />
                              <span className="text-xs font-medium text-slate-700">{publisher.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-medium text-slate-600">
                          {content.publishInfo?.date
                            ? formatPersianDate(content.publishInfo.date)
                            : formatPersianDate(content.updatedAt)}
                        </span>
                      </td>
                      <td className="p-4 text-left">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="warning"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (confirm('انتشار لغو شود و به «آماده انتشار» بازگردد؟')) {
                                void unpublishContent(content.id);
                              }
                            }}
                            loading={publishingContentIds.includes(content.id)}
                            disabled={!hasPermission('content.publish')}
                            title="لغو انتشار"
                            className="min-h-9 px-3 py-2 text-xs"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>لغو انتشار</span>
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (confirm(`«${content.title}» بایگانی شود؟`)) {
                                void archiveItem('content', content.id);
                              }
                            }}
                            title="بایگانی محتوا"
                            className="min-h-9 px-3 py-2 text-xs"
                          >
                            <Archive className="w-4 h-4" />
                            <span>بایگانی</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
