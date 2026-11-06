import React, { useState } from 'react';
import { ContentTypeBadge } from '../../utils/statusBadges';
import { formatPersianDate } from '../../utils/date';
import { toIsoDateKey } from '../../utils/isoDate';
import { useApp } from '../../context/AppContext';
import type { Content } from '../../types';
import { sortByPublicationMoment } from '../../utils/publicationTiming';
import { Button, IconButton } from '../common/Primitives';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { Collapsible } from '../common/Collapsible';
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
  ArrowRight,
  Copy,
  SlidersHorizontal,
  Search
} from 'lucide-react';

export const ContentPublishedView: React.FC = () => {
  const {
    contents,
    users,
    contentTypes,
    setActiveView,
    setSelectedContentId,
    archiveItem,
    duplicateContent,
    pendingMutationKeys,
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

  // تازه‌ترین انتشار بالا؛ قاعدهٔ ترتیب همان قاعدهٔ مشترک «میز انتشار» است و
  // پروندهٔ بدون تاریخ انتشار در پایان فهرست می‌ماند.
  const publishedContents = sortByPublicationMoment<Content>(
    contents.filter(content => content.status === 'published'),
    content => ({ date: content.publishInfo?.date, time: content.publishInfo?.time, published: true }),
  );

  /**
   * فیلترهای همین صفحه (دور ۸۷): نوع محتوا، ناشر و بازهٔ تاریخ انتشار.
   *
   * بخش فیلتر بازشو است تا فهرست منتشرشده‌ها در حالت عادی شلوغ نشود؛ همهٔ
   * مقایسه‌های تاریخ با کلید میلادیِ نرمال‌شده انجام می‌شود تا تاریخ‌های شمسی
   * ثبت‌شده در دادهٔ قدیمی هم در بازه بیایند.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [publisherFilter, setPublisherFilter] = useState('all');
  /** فیلتر «مجموعهٔ محتوا»: همان سری‌ای که محتوا به آن پیوند خورده است. */
  const [seriesFilter, setSeriesFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const publishers = users.filter(user => contents.some(content => content.status === 'published' && content.publisherId === user.id));
  /**
   * گزینه‌های مجموعه از خودِ محتواهای منتشرشده ساخته می‌شود (نه فهرست همهٔ
   * مجموعه‌ها) تا فقط مجموعه‌هایی بیایند که واقعاً پروندهٔ منتشرشده دارند؛
   * گزینهٔ «بدون مجموعه» هم برای پرونده‌های مستقل می‌ماند.
   */
  const seriesOptions = Array.from(new Map(
    publishedContents
      .filter(content => content.seriesId)
      .map(content => [String(content.seriesId), content.seriesName || content.seriesCode || `مجموعهٔ ${content.seriesId}`] as const),
  ).entries()).map(([id, name]) => ({ id, name }));
  const filteredContents = publishedContents.filter(content => {
    const needle = query.trim().toLowerCase();
    if (needle) {
      const haystack = `${content.title} ${content.code || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (typeFilter !== 'all' && content.type !== typeFilter) return false;
    if (publisherFilter !== 'all' && String(content.publisherId || '') !== publisherFilter) return false;
    if (seriesFilter === 'none' && content.seriesId) return false;
    if (seriesFilter !== 'all' && seriesFilter !== 'none' && String(content.seriesId || '') !== seriesFilter) return false;
    if (dateFrom || dateTo) {
      const day = toIsoDateKey(content.publishInfo?.date);
      if (!day) return false;
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
    }
    return true;
  });
  const activeFilterCount = [Boolean(query.trim()), typeFilter !== 'all', publisherFilter !== 'all', seriesFilter !== 'all', Boolean(dateFrom), Boolean(dateTo)].filter(Boolean).length;
  const resetFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setPublisherFilter('all');
    setSeriesFilter('all');
    setDateFrom('');
    setDateTo('');
  };

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
              {activeFilterCount > 0
                ? `${filteredContents.length} از ${publishedContents.length} محتوای منتشرشده`
                : `${publishedContents.length} محتوای منتشرشده در سامانه`}
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(value => !value)}
          className="ui-button ui-button-secondary text-xs"
        >
          <SlidersHorizontal className="h-4 w-4" />
          فیلترها
          {activeFilterCount > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[9px] font-black text-white">{activeFilterCount.toLocaleString('fa-IR')}</span>}
        </button>
      </div>

      <Collapsible open={filtersOpen}>
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="فیلتر محتواهای منتشرشده">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-black text-slate-700"><SlidersHorizontal className="h-4 w-4 text-emerald-600" />فیلتر محتواهای منتشرشده</div>
            <span className="text-[11px] text-slate-500">{filteredContents.length.toLocaleString('fa-IR')} نتیجه</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-[11px] font-bold text-slate-600">
              <span className="inline-flex items-center gap-1"><Search className="h-3.5 w-3.5 text-slate-400" />جست‌وجوی عنوان یا کد</span>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="بخشی از عنوان یا کد محتوا" className="ui-input mt-1.5 text-xs" />
            </label>
            <label className="text-[11px] font-bold text-slate-600">نوع محتوا
              <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="ui-input mt-1.5 text-xs">
                <option value="all">همه انواع</option>
                {contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-600">ناشر
              <select value={publisherFilter} onChange={event => setPublisherFilter(event.target.value)} className="ui-input mt-1.5 text-xs">
                <option value="all">همه ناشران</option>
                {publishers.map(user => <option key={user.id} value={user.id}>{user.name} {user.family || ''}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-600">مجموعهٔ محتوا
              <select value={seriesFilter} onChange={event => setSeriesFilter(event.target.value)} className="ui-input mt-1.5 text-xs">
                <option value="all">همهٔ مجموعه‌ها</option>
                <option value="none">بدون مجموعه</option>
                {seriesOptions.map(series => <option key={series.id} value={series.id}>{series.name}</option>)}
              </select>
            </label>
            <div className="text-[11px] font-bold text-slate-600">از تاریخ انتشار<PersianDatePicker className="mt-1.5" value={dateFrom} onChange={setDateFrom} placeholder="از تاریخ شمسی…" /></div>
            <div className="text-[11px] font-bold text-slate-600">تا تاریخ انتشار<PersianDatePicker className="mt-1.5" value={dateTo} onChange={setDateTo} placeholder="تا تاریخ شمسی…" /></div>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={resetFilters} disabled={activeFilterCount === 0} className="ui-button ui-button-secondary text-[11px] disabled:opacity-50">پاک کردن فیلترها</button>
          </div>
        </section>
      </Collapsible>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 whitespace-nowrap">عنوان محتوا</th>
                <th className="p-4 whitespace-nowrap">نوع</th>
                <th className="p-4 whitespace-nowrap">ناشر</th>
                <th className="p-4 whitespace-nowrap">تاریخ و ساعت انتشار</th>
                <th className="p-4 w-44 whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-500">{publishedContents.length === 0 ? 'هنوز محتوایی منتشر نشده است.' : 'هیچ محتوای منتشرشده‌ای با این فیلترها پیدا نشد.'}</p>
                  </td>
                </tr>
              ) : (
                filteredContents.map(content => {
                  // رنگ نشانگر نوع محتوا از تنظیمات همان نوع می‌آید، نه یک رنگ ثابت.
                  const typeSetting = contentTypes.find(ct => ct.id === content.type);
                  const typeName = typeSetting?.name || content.type;
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
                            <div className="mt-1 flex max-w-[280px] items-center gap-2"><span dir="ltr" className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-600">{content.code || 'کد عمومی'}</span><span className="truncate text-[10px] text-slate-500">{content.topic || 'بدون موضوع اختصاصی'}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4"><ContentTypeBadge color={typeSetting?.color} label={typeName} /></td>
                      <td className="p-4">
                        {(() => {
                          const publisher = users.find(u => u.id === content.publisherId);
                          // فقط نام ناشر؛ عکس مسئول انتشار در این فهرست نمایش داده نمی‌شود.
                          return publisher ? (
                            <span className="text-xs font-medium text-slate-700">{publisher.name}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td className="p-4">
                        <div className="text-xs font-medium text-slate-600">
                          <span>{content.publishInfo?.date ? formatPersianDate(content.publishInfo.date) : formatPersianDate(content.updatedAt)}</span>
                          <span className="mt-1 block text-[10px] font-bold text-indigo-600">ساعت {content.publishInfo?.time || 'تعیین نشده'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-left">
                        <div className="flex items-center justify-end gap-2">
                          {hasPermission('content.create') && <Button
                            variant="secondary"
                            disabled={pendingMutationKeys.includes('contents:create')}
                            onClick={(event) => { event.stopPropagation(); void duplicateContent(content.id); }}
                            title="ساخت یک کپی از محتوا"
                            aria-label="ساخت یک کپی از محتوا"
                            className="ui-action-button ui-icon-button"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>}
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
                            className="ui-action-button px-3 text-xs"
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
                            aria-label="بایگانی محتوا"
                            className="ui-action-button ui-icon-button"
                          >
                            <Archive className="w-4 h-4" />
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
