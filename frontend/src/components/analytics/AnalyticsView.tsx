import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
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

export const AnalyticsView: React.FC = () => {
  const { projects, tasks, users, teams, ideas, contents, letters } = useApp();
  
  // KPIS
  const totalProjects = projects.length;
  const completedProjects = projects.filter(p => p.status === 'completed').length;
  const projectCompletionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalIdeas = ideas?.length || 0;
  const approvedIdeas = (ideas || []).filter(i => i.status === 'approved' || i.status === 'converted').length;
  const ideaApprovalRate = totalIdeas > 0 ? Math.round((approvedIdeas / totalIdeas) * 100) : 0;

  const totalContents = contents?.length || 0;
  const publishedContents = (contents || []).filter(c => c.publishInfo?.status === 'published' || c.status === 'published').length;
  const contentPublishRate = totalContents > 0 ? Math.round((publishedContents / totalContents) * 100) : 0;

  const totalLetters = letters?.length || 0;
  const respondedLetters = (letters || []).filter(l => l.status === 'responded' || l.status === 'archived').length;

  // Task Status Data
  const statusData = [
    { name: 'بک‌لاگ', value: tasks.filter(t => t.status === 'backlog').length, color: '#94a3b8' },
    { name: 'برای انجام', value: tasks.filter(t => t.status === 'todo').length, color: '#3b82f6' },
    { name: 'در حال انجام', value: tasks.filter(t => t.status === 'in_progress').length, color: '#f59e0b' },
    { name: 'در حال بررسی', value: tasks.filter(t => t.status === 'review').length, color: '#8b5cf6' },
    { name: 'تکمیل‌شده', value: tasks.filter(t => t.status === 'completed').length, color: '#10b981' }
  ].filter(d => d.value > 0);

  // Content Type Data
  const contentTypeData = [
    { name: 'ویدیو', value: (contents || []).filter(c => c.type === 'video').length, color: '#f43f5e' },
    { name: 'مقاله', value: (contents || []).filter(c => c.type === 'article').length, color: '#10b981' },
    { name: 'پادکست', value: (contents || []).filter(c => c.type === 'podcast').length, color: '#8b5cf6' },
    { name: 'پست شبکه‌های اجتماعی', value: (contents || []).filter(c => c.type === 'social_post').length, color: '#3b82f6' },
  ].filter(d => d.value > 0);

  // Ideas Status Data
  const ideasStatusData = [
    { name: 'پیش‌نویس', value: (ideas || []).filter(i => i.status === 'draft').length, color: '#94a3b8' },
    { name: 'در حال بررسی', value: (ideas || []).filter(i => i.status === 'in_review').length, color: '#f59e0b' },
    { name: 'تایید شده', value: (ideas || []).filter(i => i.status === 'approved').length, color: '#10b981' },
    { name: 'رد شده', value: (ideas || []).filter(i => i.status === 'rejected').length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Team Workload Data
  const teamWorkload = teams.map(team => {
    const teamMembers = users.filter(u => team.memberIds.includes(u.id));
    const avgWorkload = teamMembers.length > 0 
      ? Math.round(teamMembers.reduce((sum, m) => sum + (m.workloadPercentage || 0), 0) / teamMembers.length)
      : 0;
    
    const teamTasks = tasks.filter(t => team.memberIds.includes(t.assigneeId) && t.status !== 'completed');

    return {
      name: team.name,
      avgWorkload,
      activeTasks: teamTasks.length,
      color: team.color || '#6366f1'
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 pt-4 select-none" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-indigo-600" />
            <span>گزارشات و تحلیل‌های جامع</span>
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-2">
            دید عمیق نسبت به عملکرد تمام بخش‌های پلتفرم و بهره‌وری تیم.
          </p>
        </div>
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
        {/* Team Workload */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Users2 className="w-5 h-5 text-indigo-600" />
            <span>بار کاری تیم‌ها</span>
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamWorkload} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'inherit' }} />
                <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'inherit' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'inherit' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', textAlign: 'right', fontFamily: 'inherit' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px', fontFamily: 'inherit', fontWeight: 'bold' }} />
                <Bar yAxisId="left" dataKey="avgWorkload" name="میانگین بار کاری (%)" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar yAxisId="right" dataKey="activeTasks" name="تعداد وظایف فعال" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
