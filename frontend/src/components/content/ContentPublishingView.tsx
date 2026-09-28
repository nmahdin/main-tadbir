import { getContentStatusBadge } from '../../utils/statusBadges';
import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import { Content, ContentPublishStatus } from '../../types';
import { Avatar } from '../common/Avatar';
import { PublishingCalendar } from './PublishingCalendar';
import {
  Share2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Filter,
  Globe,
  Instagram,
  Send,
  Video,
  Linkedin,
  MessageCircle,
  ExternalLink,
  Zap,
  Sparkles,
  BarChart3,
  Check,
  Eye,
  Heart,
  MessageSquare
} from 'lucide-react';


import * as LucideIcons from 'lucide-react';
const getPlatformIcon = (iconName: string) => {
  const Icon = (LucideIcons as any)[iconName] || LucideIcons.Globe;
  return Icon;
};

export const ContentPublishingView: React.FC = () => {
  const {
    contents,
    publishContentNow,
    updateContentPublishInfo,
    setSelectedContentId,
    setActiveView,
    departments,
    users,
    publishingPlatforms
  } = useApp();

  const [activeChannelFilter, setActiveChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'calendar' | 'channels' | 'table'>('timeline');

  // Modal for scheduling
  const [schedulingContent, setSchedulingContent] = useState<Content | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [scheduleCaption, setScheduleCaption] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredContents = contents.filter(c => {
    const matchesSearch =
      !searchTerm ||
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.topic && c.topic.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.publishInfo?.caption && c.publishInfo.caption.toLowerCase().includes(searchTerm.toLowerCase()));

    const channels = c.publishInfo?.channels || [];
    const matchesChannel = activeChannelFilter === 'all' || channels.includes(activeChannelFilter);

    const pubStatus = c.publishInfo?.status || 'planned';
    const matchesStatus = statusFilter === 'all' || pubStatus === statusFilter;

    return matchesSearch && matchesChannel && matchesStatus;
  });

  const publishedList = contents.filter(c => (c.publishInfo?.status === 'published' || c.status === 'published'));
  const readyList = contents.filter(c => c.status === 'ready_to_publish' || c.publishInfo?.status === 'ready');
  const scheduledList = contents.filter(c => c.publishInfo?.status === 'planned' || c.publishInfo?.status === 'ready');

  const openScheduleModal = (c: Content) => {
    setSchedulingContent(c);
    setScheduleDate(c.publishInfo?.date || todayStr);
    setScheduleTime(c.publishInfo?.time || '18:00');
    setSelectedChannels(c.publishInfo?.channels || ['website']);
    setScheduleCaption(c.publishInfo?.caption || '');
  };

  const handleSaveSchedule = () => {
    if (!schedulingContent) return;
    updateContentPublishInfo(schedulingContent.id, {
      date: scheduleDate,
      time: scheduleTime,
      channels: selectedChannels,
      caption: scheduleCaption,
      status: scheduleDate ? 'ready' : 'planned'
    });
    setSchedulingContent(null);
  };

  const toggleChannelSelection = (chKey: string) => {
    setSelectedChannels(prev =>
      prev.includes(chKey) ? prev.filter(k => k !== chKey) : [...prev, chKey]
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right select-none" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              میز و تقویم انتشار محتوا
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            برنامه‌ریزی، زمان‌بندی و انتشار یکپارچه در پلتفرم‌ها و شبکه‌های اجتماعی رسمی
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setActiveView('content')}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            مدیریت و تولید محتوا
          </button>
          <button
            onClick={() => {
              const firstReady = contents.find(c => c.status === 'ready_to_publish' || c.publishInfo?.status === 'ready');
              if (firstReady) openScheduleModal(firstReady);
            }}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>زمان‌بندی انتشار جدید</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">منتشرشده در سامانه</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{publishedList.length}</span>
            <span className="text-[11px] text-emerald-600 font-bold">محتوای زنده</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">آماده و در صف انتشار</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{readyList.length}</span>
            <span className="text-[11px] text-teal-600 font-bold">تأییدشده نهایی</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">برنامه‌ریزی‌شده</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{scheduledList.length}</span>
            <span className="text-[11px] text-indigo-600 font-bold">در تقویم محتوا</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">کانال‌های فعال انتشار</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">۶ کانال</span>
            <span className="text-[11px] text-purple-600 font-bold">سراسری و تخصصی</span>
          </div>
        </div>
      </div>

      {/* Channel Quick Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setActiveChannelFilter('all')}
          className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeChannelFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          همه کانال‌ها
        </button>

        {publishingPlatforms.map((cfg) => {
          const key = cfg.id;
          const Icon = getPlatformIcon(cfg.iconName || 'Globe');
          const isActive = activeChannelFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveChannelFilter(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : cfg.color}`} />
              <span>{cfg.name}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and View Toggles Bar */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در عناوین، موضوع و کپشن‌های انتشار..."
            className="w-full pr-9 pl-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden cursor-pointer"
          >
            <option value="all">همه وضعیت‌های انتشار</option>
            <option value="ready">آماده انتشار</option>
            <option value="planned">برنامه‌ریزی‌شده</option>
            <option value="published">منتشرشده</option>
          </select>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'timeline' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              گاه‌شمار
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'calendar' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              تقویم شمسی انتشار
            </button>
            <button
              onClick={() => setActiveTab('channels')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'channels' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              ماتریس کانال‌ها
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'table' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              جدول انتشار
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Areas */}
      {activeTab === 'calendar' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs">
          <PublishingCalendar
            onSelectContent={(id) => {
              setSelectedContentId(id);
              setActiveView('content-detail');
            }}
            onScheduleContent={openScheduleModal}
          />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="space-y-4">
          {filteredContents.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
              <Share2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">محتوایی در این فیلتر یافت نشد</h3>
              <p className="text-xs text-slate-500 mt-1">
                برای تنظیم زمان‌بندی انتشار از دکمه «زمان‌بندی انتشار جدید» استفاده کنید.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContents.map(c => {
                const owner = users.find(u => u.id === c.ownerId);
                const isPublished = (c.publishInfo?.status === 'published' || c.status === 'published');
                const isReady = c.publishInfo?.status === 'ready' || c.status === 'ready_to_publish';
                const channels = c.publishInfo?.channels || ['website'];

                return (
                  <div
                    key={c.id}
                    className={`bg-white rounded-3xl border p-5 transition-all relative overflow-hidden flex flex-col justify-between ${
                      isPublished
                        ? 'border-emerald-200/90 shadow-2xs'
                        : isReady
                        ? 'border-teal-300 ring-1 ring-teal-100 shadow-xs'
                        : 'border-slate-200/80 hover:shadow-md'
                    }`}
                  >
                    <div>
                      {/* Top badges */}
                      <div className="flex items-center justify-between mb-3">
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${
                          isPublished
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isReady
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}>
                          {isPublished ? 'منتشرشده' : isReady ? 'آماده انتشار' : 'برنامه‌ریزی‌شده'}
                        </span>

                        <div className="flex items-center gap-1 text-slate-400 text-xs font-mono">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatPersianDate(c.publishInfo?.date) || 'تنظیم نشده'}</span>
                        </div>
                      </div>

                      {/* Title */}
                      <h3
                        onClick={() => {
                          setSelectedContentId(c.id);
                          setActiveView('content-detail');
                        }}
                        className="text-sm font-black text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer line-clamp-2 mb-2 leading-snug"
                      >
                        {c.title}
                      </h3>

                      {/* Topic & Caption */}
                      {c.publishInfo?.caption && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-2xl line-clamp-2 mb-3 border border-slate-100">
                          {c.publishInfo.caption}
                        </p>
                      )}

                      {/* Channels Pills */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-4">
                        {channels.map(ch => {
                          const cfg = publishingPlatforms.find(p => p.id === ch) || publishingPlatforms[0] || { name: ch, iconName: 'Globe', bg: '#f1f5f9', color: '#64748b' };
                          const Icon = getPlatformIcon(cfg.iconName || 'Globe');
                          return (
                            <span
                              key={ch}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border`} style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.bg }}
                            >
                              <Icon className="w-3 h-3" />
                              <span>{cfg.name}</span>
                            </span>
                          );
                        })}
                      </div>

                      {/* Metrics if published */}
                      {isPublished && c.publishInfo?.metrics && (
                        <div className="grid grid-cols-3 gap-2 p-2.5 bg-emerald-50/50 rounded-2xl border border-emerald-100 mb-4 text-center">
                          <div>
                            <span className="text-[10px] text-slate-500 block">بازدید</span>
                            <span className="text-xs font-extrabold text-emerald-800">
                              {c.publishInfo.metrics.views?.toLocaleString('fa-IR') || '---'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">پسندیدن</span>
                            <span className="text-xs font-extrabold text-emerald-800">
                              {c.publishInfo.metrics.likes?.toLocaleString('fa-IR') || '---'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">بازنشر</span>
                            <span className="text-xs font-extrabold text-emerald-800">
                              {c.publishInfo.metrics.shares?.toLocaleString('fa-IR') || '---'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {owner && <Avatar user={owner} size="xs" showTooltip />}
                        <span className="text-[11px] text-slate-500">{c.publishInfo?.time || '۱۸:۰۰'}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isPublished && (
                          <button
                            onClick={() => publishContentNow(c.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                            title="انتشار فوری"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>انتشار آنی</span>
                          </button>
                        )}
                        <button
                          onClick={() => openScheduleModal(c)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          تنظیمات
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Channel Matrix View */}
      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {publishingPlatforms.map((cfg) => {
            const chKey = cfg.id;
            const Icon = getPlatformIcon(cfg.iconName || 'Globe');
            const channelContents = contents.filter(c => (c.publishInfo?.channels || ['website']).includes(chKey));

            return (
              <div key={chKey} className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
                <div className={`p-4 border-b border-slate-100 flex items-center justify-between`} style={{ backgroundColor: cfg.bg }}>
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl bg-white shadow-2xs`} style={{ color: cfg.color }}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">{cfg.name}</h3>
                      <span className="text-[10px] text-slate-500 font-bold">{channelContents.length} محتوای مرتبط</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 divide-y divide-slate-100 flex-1 overflow-y-auto max-h-80 space-y-2">
                  {channelContents.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      هیچ محتوایی برای این کانال تنظیم نشده است.
                    </div>
                  ) : (
                    channelContents.map(c => {
                      const isPub = (c.publishInfo?.status === 'published' || c.status === 'published');
                      return (
                        <div
                          key={c.id}
                          className="pt-2 flex items-start justify-between gap-2 group cursor-pointer"
                          onClick={() => {
                            setSelectedContentId(c.id);
                            setActiveView('content-detail');
                          }}
                        >
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                              {c.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatPersianDate(c.publishInfo?.date) || '---'} {c.publishInfo?.time ? `(${c.publishInfo.time})` : ''}
                            </span>
                          </div>
                          {getContentStatusBadge(c.status)}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {activeTab === 'table' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">عنوان محتوا</th>
                  <th className="p-4">پلتفرم‌های مقصد</th>
                  <th className="p-4">تاریخ و ساعت انتشار</th>
                  <th className="p-4">وضعیت</th>
                  <th className="p-4">مسئول انتشار</th>
                  <th className="p-4 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContents.map(c => {
                  const isPub = (c.publishInfo?.status === 'published' || c.status === 'published');
                  const owner = users.find(u => u.id === c.ownerId);
                  const channels = c.publishInfo?.channels || ['website'];

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4">
                        <div
                          onClick={() => {
                            setSelectedContentId(c.id);
                            setActiveView('content-detail');
                          }}
                          className="cursor-pointer group"
                        >
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {c.title}
                          </h4>
                          <span className="text-[11px] text-slate-400">{c.topic || 'بدون موضوع'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {channels.map(ch => {
                            const cfg = publishingPlatforms.find(p => p.id === ch) || publishingPlatforms[0] || { name: ch, iconName: 'Globe', bg: '#f1f5f9', color: '#64748b' };
                          const Icon = getPlatformIcon(cfg.iconName || 'Globe');
                            return (
                              <span key={ch} className={`p-1.5 rounded-lg border`} style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.bg }} title={cfg.name}>
                                <Icon className="w-3.5 h-3.5" />
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-4 text-xs font-mono text-slate-700">
                        {formatPersianDate(c.publishInfo?.date) || '---'} {c.publishInfo?.time ? `| ${c.publishInfo.time}` : ''}
                      </td>
                      <td className="p-4">
                        {getContentStatusBadge(c.status)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {owner && <Avatar user={owner} size="xs" />}
                          <span className="text-xs font-medium text-slate-700">{owner?.name || 'نامشخص'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-left">
                        <div className="flex items-center justify-end gap-2">
                          {!isPub && (
                            <button
                              onClick={() => publishContentNow(c.id)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Zap className="w-3 h-3" />
                              انتشار
                            </button>
                          )}
                          <button
                            onClick={() => openScheduleModal(c)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          >
                            تنظیم
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schedule / Edit Modal */}
      {schedulingContent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-right">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">تنظیم زمان‌بندی و پلتفرم‌های انتشار</h3>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{schedulingContent.title}</p>
                </div>
              </div>
              <button
                onClick={() => setSchedulingContent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">تاریخ انتشار</label>
                  <PersianDatePicker
    value={scheduleDate}
    onChange={(val) => setScheduleDate(val)}
    placeholder="انتخاب تاریخ"
  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">ساعت انتشار</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Channels Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">پلتفرم‌های مقصد انتشار</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {publishingPlatforms.map((cfg) => {
          const key = cfg.id;
                    const isSel = selectedChannels.includes(key);
                    const Icon = getPlatformIcon(cfg.iconName || 'Globe');
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => toggleChannelSelection(key)}
                        className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                          isSel
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-1 ring-indigo-200'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSel ? 'text-indigo-600' : ''}`} style={isSel ? {} : {color: cfg.color}} />
                        <span className="text-[11px] truncate">{cfg.name}</span>
                        {isSel && <Check className="w-3.5 h-3.5 text-indigo-600 mr-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Caption / Hashtags */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">متن کپشن و هشتگ‌ها</label>
                <textarea
                  rows={3}
                  value={scheduleCaption}
                  onChange={(e) => setScheduleCaption(e.target.value)}
                  placeholder="متن پست، چکیده یا لینک مرتبط..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden resize-none"
                ></textarea>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setSchedulingContent(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleSaveSchedule();
                    publishContentNow(schedulingContent.id);
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>انتشار فوری</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all cursor-pointer"
                >
                  ذخیره زمان‌بندی
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
