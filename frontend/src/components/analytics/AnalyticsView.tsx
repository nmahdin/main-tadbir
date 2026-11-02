import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { request } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatPersianIsoDateTime, formatPersianNumber } from '../../utils/date';
import { ErrorState, LoadingState } from '../common/Primitives';
import {
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  TrendingUp,
  BarChart3,
  ArrowLeft,
  Clock3,
  PieChart as PieChartIcon,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  FileText,
  Lightbulb,
  Inbox,
  RefreshCw
} from 'lucide-react';
import { ProgressBar } from '../common/Avatar';

type AnalyticsSummary = {
  data: {
    projects: { total: number; completed: number; completionRate: number; active: { id: string; name: string; progress: number; color: string; status: string }[] };
    tasks: { total: number; completed: number; overdue: number; completionRate: number; byStatus: Record<string, number> };
    contents: { total: number; published: number; publishRate: number; byType: Record<string, number>; byStatus: Record<string, number> };
    ideas: { total: number; approved: number; approvalRate: number; byStatus: Record<string, number> };
    meetings: { total: number; completed: number; byStatus: Record<string, number> };
  };
  meta: { generatedAt: string; timezone: string };
};

export const AnalyticsView: React.FC = () => {
  const { currentUser } = useAuth();
  const { contentStatuses, taskStatuses, contentTypes } = useApp();
  const navigate = useNavigate();
  const summary = useQuery<AnalyticsSummary>({
    queryKey: ['analytics', currentUser.id, 'summary'],
    queryFn: ({ signal }) => request('/analytics/summary', { signal }),
    staleTime: 60_000,
  });

  if (summary.isPending) return <LoadingState label="در حال محاسبه گزارش…" />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;

  const report = summary.data.data;
  const reportMeta = summary.data.meta;
  const totalProjects = report.projects.total;
  const projectCompletionRate = report.projects.completionRate;
  const totalTasks = report.tasks.total;
  const taskCompletionRate = report.tasks.completionRate;
  const overdueTasks = report.tasks.overdue;
  const totalIdeas = report.ideas.total;
  const ideaApprovalRate = report.ideas.approvalRate;
  const totalContents = report.contents.total;
  const contentPublishRate = report.contents.publishRate;
  const totalMeetings = report.meetings.total;
  const completedMeetings = report.meetings.completed;
  const projects = report.projects.active;

  /**
   * وضعیت وظایف از تنظیمات سازمان خوانده می‌شود؛ برچسب و رنگ هر وضعیت همان
   * چیزی است که کاربر در فهرست وظایف می‌بیند و هیچ وضعیتی جا نمی‌ماند.
   */
  const statusData = taskStatuses
    .map(status => ({ id: status.id, name: status.label, value: report.tasks.byStatus[status.id] || 0, color: status.color }))
    .filter(item => item.value > 0);

  /**
   * انواع محتوا هم از تنظیمات خودشان می‌آیند. پیش‌تر چهار نوع ثابت در کد
   * نوشته شده بود و آمار بقیهٔ انواع (عکس، موشن، خبر و…) در نمودار گم می‌شد،
   * در حالی که عدد کل محتوا همه را می‌شمرد.
   */
  const contentTypeData = contentTypes
    .map(type => ({ id: type.id, name: type.name, value: report.contents.byType[type.id] || 0, color: type.color || '#6366f1' }))
    .filter(item => item.value > 0);
  const unknownContentTypes = Object.entries(report.contents.byType || {})
    .filter(([id, value]) => value > 0 && !contentTypes.some(type => type.id === id))
    .map(([id, value]) => ({ id, name: id, value, color: '#94a3b8' }));
  const contentTypeChart = [...contentTypeData, ...unknownContentTypes];

  /** وضعیت‌های واقعی ایده در اتاق فکر؛ «در حال بررسی» یک وضعیت ساختگی بود. */
  const IDEA_STATUS_TONES: Array<{ ids: string[]; name: string; color: string }> = [
    { ids: ['draft'], name: 'پیش‌نویس', color: '#94a3b8' },
    { ids: ['submitted'], name: 'در انتظار بررسی اولیه', color: '#f59e0b' },
    { ids: ['under_review'], name: 'در حال ارزیابی و رأی‌گیری', color: '#3b82f6' },
    { ids: ['needs_info'], name: 'نیازمند اطلاعات تکمیلی', color: '#8b5cf6' },
    { ids: ['approved'], name: 'تأییدشده برای اجرا', color: '#10b981' },
    { ids: ['in_progress'], name: 'در حال پیاده‌سازی', color: '#6366f1' },
    { ids: ['implemented', 'completed'], name: 'خاتمه‌یافته', color: '#14b8a6' },
    { ids: ['rejected'], name: 'ردشده', color: '#ef4444' },
    { ids: ['archived'], name: 'بایگانی‌شده', color: '#64748b' },
  ];
  const ideasStatusData = IDEA_STATUS_TONES
    .map(tone => ({ name: tone.name, color: tone.color, value: tone.ids.reduce((sum, id) => sum + (report.ideas.byStatus[id] || 0), 0) }))
    .filter(item => item.value > 0);

  /** وضعیت جلسات اتاق فکر: تعداد کل و برگزارشده‌ها. */
  const MEETING_STATUS_TONES: Array<{ id: string; name: string; color: string }> = [
    { id: 'scheduled', name: 'برنامه‌ریزی‌شده', color: '#3b82f6' },
    { id: 'in_progress', name: 'در حال برگزاری', color: '#f59e0b' },
    { id: 'completed', name: 'برگزارشده', color: '#10b981' },
    { id: 'cancelled', name: 'لغوشده', color: '#ef4444' },
    { id: 'archived', name: 'بایگانی‌شده', color: '#94a3b8' },
  ];
  const meetingStatusData = MEETING_STATUS_TONES
    .map(tone => ({ name: tone.name, color: tone.color, value: report.meetings.byStatus[tone.id] || 0 }))
    .filter(item => item.value > 0);

  // توزیع وضعیت محتوا فقط از دادهٔ واقعی سرور ساخته می‌شود و برچسب/رنگ هر وضعیت
  // از همان تنظیمات سازمان می‌آید؛ وضعیتی که داده ندارد نمایش داده نمی‌شود.
  const contentStatusData = contentStatuses
    .map(status => ({ id: status.id, name: status.label, color: status.color, value: report.contents.byStatus?.[status.id] || 0 }))
    .filter(item => item.value > 0);
  const unknownContentStatuses = Object.entries(report.contents.byStatus || {})
    .filter(([id, value]) => value > 0 && !contentStatuses.some(status => status.id === id))
    .map(([id, value]) => ({ id, name: id, color: '#94a3b8', value }));
  const contentStatusChart = [...contentStatusData, ...unknownContentStatuses];
  const maxContentStatus = Math.max(1, ...contentStatusChart.map(item => item.value));

  /** پیوند هر شاخص به همان فهرست فیلترشدهٔ مرتبط، به‌جای یک مقصد عمومی. */
  const drillDown = [
    { label: 'فهرست پروژه‌ها', to: '/projects', hint: 'همهٔ پروژه‌های سازمان' },
    { label: 'وظایف در جریان', to: '/tasks', hint: 'وظایف واگذارشده به شما و پروژه‌های شما' },
    { label: 'محتواهای منتشرشده', to: '/contents?status=published', hint: 'فقط محتواهای منتشرشده' },
    { label: 'آمادهٔ انتشار', to: '/contents?status=ready_to_publish', hint: 'محتواهایی که همهٔ مراحلشان تمام شده است' },
    { label: 'در حال تولید', to: '/contents?status=producing', hint: 'محتواهای در جریان تولید' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 pt-4 select-none" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-indigo-600" />
            <span>گزارش‌ها و تحلیل‌ها</span>
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-2">
            شاخص‌های سازمانی محاسبه‌شده روی سرور: پروژه‌ها، وظایف، محتوا، ایده‌ها و جلسات. هر عدد را بزنید تا فهرست همان مورد باز شود.
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400">
            <span>زمان محاسبه: {formatPersianIsoDateTime(reportMeta?.generatedAt) || 'نامشخص'}</span>
            {reportMeta?.timezone && <span>منطقهٔ زمانی سرور: <bdi dir="ltr">{reportMeta.timezone}</bdi></span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void summary.refetch()}
          disabled={summary.isFetching}
          className="ui-button ui-button-secondary shrink-0 text-xs"
          title="محاسبهٔ دوبارهٔ شاخص‌ها روی سرور"
        >
          <RefreshCw className={`h-4 w-4 ${summary.isFetching ? 'animate-spin' : ''}`} />
          به‌روزرسانی
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">پروژه‌ها</p>
              <p className="text-[10px] text-slate-500 font-medium">نرخ تکمیل</p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-slate-900">{formatPersianNumber(totalProjects)}</span>
            <span className="text-sm font-bold text-emerald-600">%{projectCompletionRate}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">وظایف</p>
              <p className="text-[10px] text-slate-500 font-medium">نرخ انجام</p>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="text-3xl font-black text-slate-900">{formatPersianNumber(totalTasks)}</span>
            <span className="flex flex-col items-end gap-1">
              <span className="text-sm font-bold text-emerald-600">%{taskCompletionRate}</span>
              {overdueTasks > 0 && <button type="button" onClick={() => navigate('/tasks?due=overdue')} title="نمایش وظایف دارای تأخیر" className="rounded-lg bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 hover:bg-rose-100">{formatPersianNumber(overdueTasks)} دارای تأخیر</button>}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">ایده‌ها</p>
              <p className="text-[10px] text-slate-500 font-medium">نرخ تایید</p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-slate-900">{formatPersianNumber(totalIdeas)}</span>
            <span className="text-sm font-bold text-emerald-600">%{ideaApprovalRate}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">محتواها</p>
              <p className="text-[10px] text-slate-500 font-medium">نرخ انتشار</p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-slate-900">{formatPersianNumber(totalContents)}</span>
            <span className="text-sm font-bold text-emerald-600">%{contentPublishRate}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">جلسات</p>
              <p className="text-[10px] text-slate-500 font-medium">برگزارشده</p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-slate-900">{formatPersianNumber(totalMeetings)}</span>
            <span className="text-sm font-bold text-emerald-600">{formatPersianNumber(completedMeetings)} جلسه</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task Status Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-indigo-600" />
            <span>وضعیت وظایف</span>
          </h3>
          <div className="flex-1 min-h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', textAlign: 'right', fontFamily: 'inherit' }}
                  itemStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <span className="text-2xl font-black text-slate-900">{formatPersianNumber(totalTasks)}</span>
                <span className="block text-[10px] text-slate-500 font-bold mt-1">تسک ثبت شده</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-6">
            {statusData.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/tasks?status=${encodeURIComponent(item.id)}`)}
                title={`نمایش وظایف با وضعیت «${item.name}»`}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-indigo-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="shrink-0">{formatPersianNumber(item.value)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Type Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            <span>انواع محتوای تولیدی</span>
          </h3>
          <div className="flex-1 min-h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={contentTypeChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {contentTypeChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', textAlign: 'right', fontFamily: 'inherit' }}
                  itemStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <span className="text-2xl font-black text-slate-900">{formatPersianNumber(totalContents)}</span>
                <span className="block text-[10px] text-slate-500 font-bold mt-1">محتوا در سیستم</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-6">
            {contentTypeChart.length === 0 && <p className="col-span-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] font-bold text-slate-500">هنوز محتوایی ثبت نشده است.</p>}
            {contentTypeChart.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/contents?type=${encodeURIComponent(item.id)}`)}
                title={`نمایش همهٔ محتواهای «${item.name}»`}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-indigo-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="max-w-[90px] truncate">{item.name}</span>
                </span>
                <span className="shrink-0">{formatPersianNumber(item.value)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Ideas Status Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <span>وضعیت ایده‌های اتاق فکر</span>
          </h3>
          <div className="flex-1 min-h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ideasStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {ideasStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', textAlign: 'right', fontFamily: 'inherit' }}
                  itemStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <span className="text-2xl font-black text-slate-900">{formatPersianNumber(totalIdeas)}</span>
                <span className="block text-[10px] text-slate-500 font-bold mt-1">ایده بررسی شده</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-6">
            {ideasStatusData.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] font-bold text-slate-500">هنوز ایده‌ای ثبت نشده است.</p>}
            {ideasStatusData.map(item => (
              <button
                key={item.name}
                type="button"
                onClick={() => navigate('/thought-room?tab=ideas')}
                title={`نمایش ایده‌های «${item.name}»`}
                className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-amber-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="shrink-0">{formatPersianNumber(item.value)}</span>
              </button>
            ))}
          </div>
        </div>
        
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* توزیع وضعیت محتوا — همان وضعیت‌هایی که جریان تولید سرور آن‌ها را می‌سازد */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              <span>وضعیت محتوا بر پایهٔ جریان تولید</span>
            </h3>
            <button type="button" onClick={() => navigate('/contents')} className="ui-button ui-button-ghost text-[11px]">فهرست کامل محتواها<ArrowLeft className="w-3.5 h-3.5" /></button>
          </div>
          {contentStatusChart.length === 0
            ? <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-500">هنوز محتوایی ثبت نشده است؛ پس توزیعی برای نمایش وجود ندارد.</p>
            : <div className="space-y-3">
              {contentStatusChart.map(item => <button key={item.id} type="button" onClick={() => navigate(`/contents?status=${encodeURIComponent(item.id)}`)} className="group w-full rounded-2xl border border-slate-100 bg-slate-50/60 p-3 text-right transition-colors hover:border-indigo-200 hover:bg-white">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-700"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-800">{formatPersianNumber(item.value)}<ArrowLeft className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500" /></span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round((item.value / maxContentStatus) * 100)}%`, backgroundColor: item.color }} /></div>
              </button>)}
            </div>}
          <p className="mt-4 text-[10px] font-bold leading-5 text-slate-400">وضعیت‌های «برنامه‌ریزی»، «در حال تولید»، «در انتظار بازبینی»، «نیازمند اصلاح»، «آماده انتشار» و «منتشرشده» را جریان تولید و انتشار تعیین می‌کند؛ روی هر ردیف بزنید تا فقط محتواهای همان وضعیت را ببینید.</p>
        </div>

        {/* دسترسی سریع به فهرست‌های مرتبط با هر شاخص */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-slate-500" />
            <span>دسترسی به فهرست‌های مرتبط</span>
          </h3>
          <div className="space-y-2.5">
            {drillDown.map(item => <button key={item.to} type="button" onClick={() => navigate(item.to)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 text-right transition-colors hover:border-indigo-200 hover:bg-white">
              <span className="min-w-0"><span className="block text-xs font-black text-slate-700">{item.label}</span><span className="mt-0.5 block text-[10px] font-bold text-slate-400">{item.hint}</span></span>
              <ArrowLeft className="w-4 h-4 shrink-0 text-slate-300" />
            </button>)}
          </div>
          <p className="mt-4 flex items-start gap-1.5 rounded-2xl border border-slate-100 bg-white p-3 text-[10px] font-bold leading-5 text-slate-500"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />این گزارش تصویر لحظه‌ای وضعیت است؛ مقایسهٔ دوره‌ای، «زمان صرف‌شده در هر مرحله» و «نرخ موفقیت انتشار» به ثبت تاریخ‌های رویدادی نیاز دارد که هنوز در سامانه ذخیره نمی‌شود و در این صفحه نمایش داده نمی‌شود.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* وضعیت جلسات — تعداد و پراکندگی وضعیت‌ها */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-teal-600" />
              <span>وضعیت جلسات</span>
            </h3>
            <button type="button" onClick={() => navigate('/thought-room?tab=meetings')} className="ui-button ui-button-ghost text-[11px]">فهرست جلسات<ArrowLeft className="w-3.5 h-3.5" /></button>
          </div>
          {meetingStatusData.length === 0
            ? <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-500">هنوز جلسه‌ای ثبت نشده است؛ پس توزیعی برای نمایش وجود ندارد.</p>
            : <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3">
                <span className="text-xs font-black text-teal-800">تعداد کل جلسات</span>
                <span className="text-lg font-black text-teal-700">{formatPersianNumber(totalMeetings)}</span>
              </div>
              {meetingStatusData.map(item => <button key={item.name} type="button" onClick={() => navigate('/thought-room?tab=meetings')} className="group w-full rounded-2xl border border-slate-100 bg-slate-50/60 p-3 text-right transition-colors hover:border-teal-200 hover:bg-white">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-700"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-800">{formatPersianNumber(item.value)}<ArrowLeft className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-500" /></span>
                </div>
              </button>)}
            </div>}
          <p className="mt-4 flex items-start gap-1.5 rounded-2xl border border-slate-100 bg-white p-3 text-[10px] font-bold leading-5 text-slate-500"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />جلسه با ثبت صورتجلسه «برگزارشده» می‌شود؛ جلسه‌های بایگانی‌شده در شمارش وضعیت‌ها می‌آیند ولی از فهرست کاری خارج‌اند.</p>
        </div>

        {/* Projects Progress View */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <span>پیشرفت پروژه‌های فعال</span>
            </h3>
          </div>
          <div className="space-y-6">
            {projects.filter(p => p.status !== 'completed' && p.status !== 'archived').slice(0, 6).map(proj => (
              <div key={proj.id} className="group">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: proj.color }}></span>
                    <span className="text-sm font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors">{proj.name}</span>
                  </div>
                  <span className="text-xs font-black text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">{formatPersianNumber(proj.progress)}٪</span>
                </div>
                <ProgressBar progress={proj.progress} color={proj.color} size="md" />
              </div>
            ))}
            {projects.filter(p => p.status !== 'completed' && p.status !== 'archived').length === 0 && (
              <div className="text-center py-10">
                 <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3 opacity-50" />
                 <p className="text-sm font-bold text-slate-500">هیچ پروژه فعالی وجود ندارد.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
