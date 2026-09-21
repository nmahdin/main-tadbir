import React, { useMemo } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { PriorityPill, TaskStatusBadge, ProjectStatusBadge } from '../common/PriorityPill';
import { Avatar, ProgressBar } from '../common/Avatar';
import {
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Flame,
  Calendar,
  Sparkles,
  TrendingUp,
  Activity,
  Layers,
  ChevronLeft,
  ArrowUpRight,
  BarChart3,
  Users,
  Lightbulb,
  FileText,
  Inbox,
  PenTool
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const DashboardView: React.FC = () => {
  const {
    currentUser,
    projects,
    tasks,
    users,
    ideas,
    contents,
    letters,
    activities,
    setSelectedTaskId,
    setSelectedProjectId,
    setActiveView,
    setIsCreateTaskOpen,
    setIsCreateProjectOpen,
    setSelectedContentId,
    setSelectedIdeaId
  } = useApp();

  const todayStr = new Date().toISOString().split('T')[0];
  const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);
  const myPendingTasks = myTasks.filter(t => t.status !== 'completed');
  
  const pendingLetters = letters?.filter(l => l.status !== 'archived') || [];
  const activeContents = contents?.filter(c => c.status !== 'published') || [];
  const activeIdeas = ideas?.filter(i => i.status === 'draft' || i.status === 'in_review') || [];

  const upcomingDeadlines = tasks
    .filter(t => t.status !== 'completed' && t.deadline >= todayStr)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 pt-4" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            داشبورد مدیریت یکپارچه
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-2">
            نمای کلی از پروژه‌ها، محتواها، نامه‌ها و وظایف شما در پلتفرم
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-2 md:pb-0">
          <button
            onClick={() => setIsCreateTaskOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>وظیفه جدید</span>
          </button>
          <button
            onClick={() => setActiveView('content')}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <PenTool className="w-4 h-4" />
            <span>تولید محتوا</span>
          </button>
          <button
            onClick={() => setActiveView('secretariat')}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-emerald-600 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Inbox className="w-4 h-4" />
            <span>ثبت نامه</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div 
          onClick={() => setActiveView('projects')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FolderKanban className="w-5 h-5" />
            </div>
            <span className="text-2xl font-black text-slate-900">{projects.filter(p => p.status === 'active').length}</span>
          </div>
          <p className="text-sm font-bold text-slate-700">پروژه‌های فعال</p>
          <p className="text-[11px] text-slate-500 mt-1">مدیریت و پیگیری پروژه‌ها</p>
        </div>

        <div 
          onClick={() => setActiveView('my-tasks')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer hover:border-rose-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <span className="text-2xl font-black text-slate-900">{myPendingTasks.length}</span>
          </div>
          <p className="text-sm font-bold text-slate-700">وظایف جاری من</p>
          <p className="text-[11px] text-slate-500 mt-1">نیاز به اقدام شما</p>
        </div>

        <div 
          onClick={() => setActiveView('content')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer hover:border-purple-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-2xl font-black text-slate-900">{activeContents.length}</span>
          </div>
          <p className="text-sm font-bold text-slate-700">محتوای در حال تولید</p>
          <p className="text-[11px] text-slate-500 mt-1">در چرخه بررسی و نشر</p>
        </div>

        <div 
          onClick={() => setActiveView('secretariat')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Inbox className="w-5 h-5" />
            </div>
            <span className="text-2xl font-black text-slate-900">{pendingLetters.length}</span>
          </div>
          <p className="text-sm font-bold text-slate-700">نامه‌های جاری</p>
          <p className="text-[11px] text-slate-500 mt-1">صندوق دبیرخانه</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Progress */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-indigo-600" />
              <span>پروژه‌های فعال اخیر</span>
            </h3>
            <button
              onClick={() => setActiveView('projects')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              همه پروژه‌ها
            </button>
          </div>
          <div className="space-y-4">
            {projects.filter(p => p.status === 'active' || p.status === 'planning').slice(0, 4).map(proj => {
              const projTasks = tasks.filter(t => t.projectId === proj.id);
              const doneCount = projTasks.filter(t => t.status === 'completed').length;
              
              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    setSelectedProjectId(proj.id);
                    setActiveView('project-detail');
                  }}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                      <span className="text-sm font-extrabold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                        {proj.name}
                      </span>
                    </div>
                    <ProjectStatusBadge status={proj.status} size="sm" />
                  </div>
                  <ProgressBar progress={proj.progress} color={proj.color} size="md" showLabel />
                  <div className="flex items-center justify-between mt-3 text-[11px] font-medium text-slate-500">
                    <span>{doneCount} از {projTasks.length} تسک تکمیل شد</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> مهلت: {formatPersianDate(proj.deadline)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contents Workflow overview */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              <span>محتواهای در جریان تولید</span>
            </h3>
            <button
              onClick={() => setActiveView('content')}
              className="text-xs font-bold text-purple-600 hover:text-purple-800 cursor-pointer"
            >
              رفتن به کارخانه محتوا
            </button>
          </div>
          <div className="space-y-3">
            {activeContents.slice(0, 5).map(c => {
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedContentId(c.id);
                    setActiveView('content-detail');
                  }}
                  className="p-4 flex flex-col gap-2 bg-white border border-slate-100 hover:border-purple-200 hover:shadow-sm rounded-2xl transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-extrabold text-slate-900 truncate">{c.title}</p>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg">
                      {c.type === 'video' ? 'ویدیو' : c.type === 'article' ? 'مقاله' : 'پست'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500">
                     <span>موضوع: {c.topic || 'عمومی'}</span>
                     <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3"/> انتشار: {c.publishDate ? formatPersianDate(c.publishDate) : 'نامشخص'}
                     </span>
                  </div>
                </div>
              );
            })}
            {activeContents.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-slate-600">تمامی محتواها منتشر شده‌اند یا موردی وجود ندارد.</p>
              </div>
            )}
          </div>
        </div>

        {/* Ideas / Think Tank */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              <span>ایده‌های اخیر (اتاق فکر)</span>
            </h3>
            <button
              onClick={() => setActiveView('think-tank')}
              className="text-xs font-bold text-amber-600 hover:text-amber-800 cursor-pointer"
            >
              ورود به اتاق فکر
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeIdeas.slice(0, 4).map(idea => (
                <div
                  key={idea.id}
                  onClick={() => {
                     setSelectedIdeaId(idea.id);
                     setActiveView('think-tank');
                  }}
                  className="p-4 flex flex-col gap-2 bg-gradient-to-br from-amber-50/30 to-white border border-amber-100 hover:border-amber-300 hover:shadow-sm rounded-2xl transition-all cursor-pointer"
                >
                  <p className="text-sm font-extrabold text-slate-900 truncate">{idea.title}</p>
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{idea.problemSolved}</p>
                  <div className="mt-auto pt-3 flex items-center justify-between border-t border-amber-50">
                     <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                        {idea.votes?.length || 0} رای
                     </span>
                     <span className="text-[10px] text-slate-500">{formatPersianDate(idea.createdAt)}</span>
                  </div>
                </div>
            ))}
            {activeIdeas.length === 0 && (
              <div className="text-center py-8 md:col-span-2">
                <Sparkles className="w-10 h-10 text-amber-300 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-slate-600">ایده جدیدی در اتاق فکر ثبت نشده است.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
