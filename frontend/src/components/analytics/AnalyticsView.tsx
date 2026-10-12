import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext';
import { buildAnalyticsRecommendations } from '../../utils/analyticsInsights';
import { formatPersianDateTime } from '../../utils/date';
import { request } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ErrorState, LoadingState } from '../common/Primitives';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import {
  TrendingUp,
  BarChart3,
  Sparkles,
  ArrowLeft,
  PieChart as PieChartIcon,
  Users2,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  FileText,
  Lightbulb,
  Inbox
} from 'lucide-react';
import { ProgressBar } from '../common/Avatar';

type AnalyticsSummary = {
  data: {
    projects: { total: number; completed: number; completionRate: number; active: { id: string; name: string; progress: number; color: string; status: string }[] };
    tasks: { total: number; completed: number; overdue: number; completionRate: number; byStatus: Record<string, number> };
    contents: { total: number; published: number; publishRate: number; byType: Record<string, number> };
    ideas: { total: number; approved: number; approvalRate: number; byStatus: Record<string, number> };
    letters: { total: number; responded: number };
    departments: { id: string; name: string; members: number; activeTasks: number; workloadIndex: number }[];
  };
  meta: { generatedAt: string; timezone: string; departmentMembership: string };
};

export const AnalyticsView: React.FC = () => {
  const { currentUser } = useAuth();
  const { hasPermission } = useApp();
  const navigate = useNavigate();
  const summary = useQuery<AnalyticsSummary>({
    queryKey: ['analytics', currentUser.id, 'summary'],
    queryFn: ({ signal }) => request('/analytics/summary', { signal }),
    staleTime: 60_000,
  });

  if (summary.isPending) return <LoadingState label="در حال محاسبه گزارش…" />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;

  const report = summary.data.data;
  const recommendations = buildAnalyticsRecommendations(report);
  const recommendationRoutes: Record<string, string> = {
    tasks: '/tasks?due=overdue&sort=deadline&direction=asc',
    contents: '/contents',
    'thought-room': '/thought-room',
    secretariat: '/secretariat',
  };
  const recommendationPermissions: Record<string, string> = {
    tasks: 'tasks.view', contents: 'content.view', 'thought-room': 'thinktank.view', secretariat: 'secretariat.view',
  };
  const recommendationLabels: Record<string, string> = {
    tasks: 'بررسی وظایف من', contents: 'رفتن به فهرست محتوا', 'thought-room': 'رفتن به اتاق فکر', secretariat: 'رفتن به دبیرخانه',
  };
  const totalProjects = report.projects.total;
  const projectCompletionRate = report.projects.completionRate;
  const totalTasks = report.tasks.total;
  const taskCompletionRate = report.tasks.completionRate;
  const totalIdeas = report.ideas.total;
  const ideaApprovalRate = report.ideas.approvalRate;
  const totalContents = report.contents.total;
  const contentPublishRate = report.contents.publishRate;
  const totalLetters = report.letters.total;
  const respondedLetters = report.letters.responded;
  const projects = report.projects.active;

  const statusData = [
    { name: 'بک‌لاگ', value: report.tasks.byStatus.backlog || 0, color: '#94a3b8' },
    { name: 'در حال انجام', value: report.tasks.byStatus.in_progress || 0, color: '#f59e0b' },
    { name: 'در حال بررسی', value: report.tasks.byStatus.review || 0, color: '#8b5cf6' },
    { name: 'تکمیل‌شده', value: report.tasks.byStatus.completed || 0, color: '#10b981' },
  ].filter(item => item.value > 0);

  const contentTypeData = [
    { name: 'ویدیو', value: report.contents.byType.video || 0, color: '#f43f5e' },
    { name: 'مقاله', value: report.contents.byType.article || 0, color: '#10b981' },
    { name: 'پادکست', value: report.contents.byType.podcast || 0, color: '#8b5cf6' },
    { name: 'پست شبکه‌های اجتماعی', value: report.contents.byType.social_post || 0, color: '#3b82f6' },
  ].filter(item => item.value > 0);

  const ideasStatusData = [
    { name: 'پیش‌نویس', value: report.ideas.byStatus.draft || 0, color: '#94a3b8' },
    { name: 'در حال بررسی', value: report.ideas.byStatus.in_review || 0, color: '#f59e0b' },
    { name: 'تایید شده', value: report.ideas.byStatus.approved || 0, color: '#10b981' },
    { name: 'رد شده', value: report.ideas.byStatus.rejected || 0, color: '#ef4444' },
  ].filter(item => item.value > 0);

  const departmentWorkload = report.departments;

  return (
      <div className="max-w-7xl mx-auto space-y-6 pb-20 pt-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-indigo-600" />
            <span>گزارشات و تحلیل‌های جامع</span>
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-2">
            شاخص‌ها و پیشنهادها از داده‌های ثبت‌شدهٔ سامانه محاسبه شده‌اند؛ شاخص بار کاری برآورد ظرفیت یا زمان نیست.
          </p>
          <p className="mt-1 text-[11px] text-slate-400">آخرین محاسبه: {formatPersianDateTime(summary.data.meta.generatedAt)}</p>
        </div>
      </div>

      <section aria-labelledby="analytics-recommendations" className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="analytics-recommendations" className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            پیشنهادهای اولویت‌دار
          </h2>
          <span className="text-[11px] text-slate-500">بر پایهٔ وضعیت فعلی داده‌ها، نه پیش‌بینی</span>
        </div>
        {recommendations.length === 0 ? (
          <p className="rounded-2xl bg-white/80 p-4 text-sm text-slate-600">بر اساس داده‌های فعلی، مورد فوری برای پیگیری شناسایی نشد.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recommendations.map(item => {
              const canNavigate = !!item.action && hasPermission(recommendationPermissions[item.action]);
              return (
                <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.priority === 'بالا' ? 'bg-rose-100 text-rose-700' : item.priority === 'متوسط' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>اولویت {item.priority}</span>
                    <span className="text-[10px] text-slate-500">اثر: {item.impact} · امکان اجرا: {item.feasibility}</span>
                  </div>
                  <h3 className="text-sm font-extrabold leading-6 text-slate-900">{item.title}</h3>
                  <p className="mt-2 flex-1 text-xs leading-6 text-slate-600">{item.basis}</p>
                  {canNavigate && item.action && <button type="button" onClick={() => navigate(recommendationRoutes[item.action!])} className="mt-3 inline-flex min-h-9 items-center justify-between gap-2 self-start rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                    {recommendationLabels[item.action]} <ArrowLeft className="h-3.5 w-3.5" />
                  </button>}
                </article>
              );
            })}
          </div>
        )}
      </section>

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
            <span className="text-3xl font-black text-slate-900">{totalProjects}</span>
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
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-slate-900">{totalTasks}</span>
            <span className="text-sm font-bold text-emerald-600">%{taskCompletionRate}</span>
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
            <span className="text-3xl font-black text-slate-900">{totalIdeas}</span>
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
            <span className="text-3xl font-black text-slate-900">{totalContents}</span>
            <span className="text-sm font-bold text-emerald-600">%{contentPublishRate}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">نامه‌ها</p>
              <p className="text-[10px] text-slate-500 font-medium">پاسخ‌داده شده</p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black text-slate-900">{totalLetters}</span>
            <span className="text-sm font-bold text-emerald-600">{respondedLetters} نامه</span>
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
                <span className="text-2xl font-black text-slate-900">{totalTasks}</span>
                <span className="block text-[10px] text-slate-500 font-bold mt-1">تسک ثبت شده</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-6">
            {statusData.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span>{item.name}</span>
                </div>
                <span>{item.value}</span>
              </div>
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
                  data={contentTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {contentTypeData.map((entry, index) => (
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
                <span className="text-2xl font-black text-slate-900">{totalContents}</span>
                <span className="block text-[10px] text-slate-500 font-bold mt-1">محتوا در سیستم</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-6">
            {contentTypeData.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="truncate max-w-[70px]">{item.name}</span>
                </div>
                <span>{item.value}</span>
              </div>
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
                <span className="text-2xl font-black text-slate-900">{totalIdeas}</span>
                <span className="block text-[10px] text-slate-500 font-bold mt-1">ایده بررسی شده</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-6">
            {ideasStatusData.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span>{item.name}</span>
                </div>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Workload */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Users2 className="w-5 h-5 text-indigo-600" />
            <span>بار کاری دپارتمان‌ها</span>
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentWorkload} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'inherit' }} />
                <YAxis yAxisId="left" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'inherit' }} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'inherit' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', textAlign: 'right', fontFamily: 'inherit' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px', fontFamily: 'inherit', fontWeight: 'bold' }} />
                <Bar yAxisId="left" dataKey="workloadIndex" name="شاخص بار وظیفه‌ای (۰ تا ۱۰۰)" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar yAxisId="right" dataKey="activeTasks" name="وظایف باز" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">شاخص برابر وزن اولویت وظایف باز به‌ازای هر عضو فعال دپارتمان است، تا سقف ۱۰۰؛ درصد ظرفیت یا زمان تخمینی نیست. عضویت بر پایهٔ دپارتمان اصلی هر فرد محاسبه می‌شود.</p>
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
                  <span className="text-xs font-black text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">{proj.progress}%</span>
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
