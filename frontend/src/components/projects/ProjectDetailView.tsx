import { runtime } from '../../config/runtime';
import { RelatedRecords } from '../workspace/RelatedRecords';
import { useSearchParams } from 'react-router-dom';
import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { KanbanBoard } from './KanbanBoard';
import { ProjectListView } from './ProjectListView';
import { ProjectCalendarView } from './ProjectCalendarView';
import { DamLibrary } from '../dam/DamLibrary';
import { getContentStatusBadge } from '../../utils/statusBadges';
import { PriorityPill, ProjectStatusBadge } from '../common/PriorityPill';
import { Avatar, AvatarGroup, ProgressBar } from '../common/Avatar';
import {
  ArrowRight,
  Kanban,
  List,
  Calendar,
  Plus,
  Users2,
  Trash2,
  Edit3,
  Clock,
  DollarSign,
  Filter,
  CheckCircle2,
  Tag,
  FolderOpen,
  MessageSquare,
  AlertTriangle,
  FileText,
  PenTool
} from 'lucide-react';

export const ProjectDetailView: React.FC = () => {
  const {
    selectedProjectId,
    projects,
    tasks,
    assets,
    users,
    contents,
    currentUser,
    setActiveView,
    setSelectedProjectId,
    setSelectedContentId,
    setIsCreateTaskOpen,
    setIsCreateContentOpen,
    setContentCreateProjectId,
    hasPermission,
    openEditProject,
    deleteProject,
    openProjectChannel
  } = useApp();

  const [tabParams,setTabParams] = useSearchParams();
  const allowedTabs = runtime.demoMode ? ['kanban','list','calendar','assets','contents'] : ['list','assets','contents'];
  const activeTab = allowedTabs.includes(tabParams.get('tab') || '') ? tabParams.get('tab')! : (runtime.demoMode ? 'kanban' : 'list');
  const setActiveTab = (tab:string) => {const next=new URLSearchParams(tabParams);next.set('tab',tab);setTabParams(next);};
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const project = projects.find(p => p.id === selectedProjectId);

  if (!project) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 m-6 text-right" dir="rtl">
        <p className="text-slate-600 font-bold">پروژه‌ای انتخاب نشده یا یافت نشد.</p>
        <button
          onClick={() => setActiveView('projects')}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
        >
          بازگشت به فهرست پروژه‌ها
        </button>
      </div>
    );
  }

  const pm = users.find(u => u.id === project.projectManagerId);
  const members = users.filter(u => project.memberIds.includes(u.id));
  const projectTasks = tasks.filter(t => t.projectId === project.id);
  const projectContents = contents.filter(c => c.projectId === project.id);
  const completedTasks = projectTasks.filter(t => t.status === 'completed');
  const projectAssets = assets ? assets.filter(a => a.projectId === project.id && !a.isTrash) : [];

  const canManageProject = hasPermission('projects.delete');

  const handleConfirmDelete = async () => {
    if (!await deleteProject(project.id)) return;
    setIsDeleteDialogOpen(false);
    setSelectedProjectId(null);
    setActiveView('projects');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right" dir="rtl">
      {/* Back button */}
      <button
        onClick={() => {
          setSelectedProjectId(null);
          setActiveView('projects');
        }}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
      >
        <ArrowRight className="w-4 h-4" />
        <span>بازگشت به سبد پروژه‌ها</span>
      </button>

      {/* Project Overview Card Header */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 min-w-0 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className="px-2.5 py-1 rounded-lg text-white font-bold text-xs tracking-wider font-mono"
                style={{ backgroundColor: project.color }}
              >
                {project.key}
              </span>
              <ProjectStatusBadge status={project.status} size="md" />
              <PriorityPill priority={project.priority} size="md" />
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                {project.category}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {project.name}
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {project.description}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {project.tags.map(tag => (
                <span
                  key={tag}
                  className="text-[11px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Action buttons & Manager Card */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-end gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Add task button */}
              <button
                id="project-add-task-btn" disabled={!hasPermission('tasks.create')}
                onClick={() => setIsCreateTaskOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>وظیفه جدید</span>
              </button>

              {/* Create content for this project */}
              {hasPermission('content.create') && (
                <button
                  onClick={() => {
                    setContentCreateProjectId(project.id);
                    setIsCreateContentOpen(true);
                  }}
                  title="ایجاد محتوای جدید برای این پروژه"
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-rose-200 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <PenTool className="w-4 h-4" />
                  <span>محتوای جدید</span>
                </button>
              )}

              {/* Project Chat Channel */}
              <button
                disabled={!hasPermission('messaging.view')} onClick={() => openProjectChannel(project.id)}
                title="ورود به کانال گفتگوی چت این پروژه"
                className="px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                <span>کانال چت پروژه</span>
              </button>

              {/* Edit Project button */}
              <button
                disabled={!hasPermission('projects.edit')} onClick={() => openEditProject(project)}
                title="ویرایش و تنظیمات پروژه"
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Edit3 className="w-4 h-4" />
                <span>ویرایش پروژه</span>
              </button>

              {/* Delete Project button */}
              {canManageProject && (
                <button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  title="حذف پروژه"
                  className="p-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Manager info chip */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-3">
              <Avatar user={pm} size="md" />
              <div>
                <span className="text-[10px] font-bold text-slate-500 block">
                  مدیر و سرپرست پروژه
                </span>
                <span className="text-xs font-bold text-slate-800">{pm?.name || 'تعیین نشده'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Project Meta Bar: Dates, Progress, Team */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-100">
          {/* Progress */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>پیشرفت اسپرینت</span>
              <span className="text-indigo-600 font-mono">{project.progress}٪</span>
            </div>
            <ProgressBar progress={project.progress} color={project.color} size="md" />
            <div className="text-[11px] text-slate-600 font-medium">
              {runtime.demoMode ? `${completedTasks.length} از ${projectTasks.length} وظیفه تکمیل شده` : 'پیشرفت ثبت‌شده در سرور'}
            </div>
          </div>

          {/* Timeline & Budget */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 space-y-1">
            <span className="text-[10px] font-bold text-slate-500">بازه زمانی و سررسید</span>
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 font-mono">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>{formatPersianDate(project.startDate)} ← {formatPersianDate(project.deadline)}</span>
            </div>
            {project.budget && (
              <div className="text-[11px] text-slate-600 pt-0.5">
                بودجه تخصیص‌یافته: <span className="font-semibold text-slate-800">{project.budget}</span>
              </div>
            )}
          </div>

          {/* Assigned Members Stack */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 block mb-1">
                تیم اختصاصی
              </span>
              <span className="text-xs font-bold text-slate-800">{members.length} عضو فعال</span>
            </div>
            <AvatarGroup users={members} max={4} size="md" />
          </div>
        </div>
      </div>

      {/* View Switcher Tabs & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tabs: Kanban, List, Calendar, Assets */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 bg-slate-200/80 rounded-2xl border border-slate-200 w-full md:w-auto pb-1 sm:pb-1">
          {runtime.demoMode && (<button
            id="tab-kanban"
            onClick={() => setActiveTab('kanban')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'kanban'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Kanban className="w-4 h-4" />
            <span>تخته کانبان</span>
          </button>)}

          <button
            id="tab-list"
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'list'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-4 h-4" />
            <span>نمای فهرست</span>
          </button>

          {runtime.demoMode && (<button
            id="tab-calendar"
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'calendar'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>تقویم</span>
          </button>)}

          <button
            id="tab-contents"
            onClick={() => setActiveTab('contents')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'contents'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>محتواهای مرتبط</span>
            {runtime.demoMode && projectContents.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-800">
                {projectContents.length}
              </span>
            )}
          </button>

          <button
            id="tab-assets"
            onClick={() => setActiveTab('assets')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'assets'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>فایل‌ها (DAM)</span>
            {runtime.demoMode && projectAssets.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
                {projectAssets.length}
              </span>
            )}
          </button>
        </div>

        {/* Filters (Shown for task tabs) */}
        {runtime.demoMode && (activeTab !== 'assets' && activeTab !== 'contents') && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Assignee Filter */}
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden"
            >
              <option value="all">تمام مسئولین اجرایی</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            {/* Priority Filter */}
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden"
            >
              <option value="all">تمام اولویت‌ها</option>
              <option value="urgent">فوری</option>
              <option value="high">بالا</option>
              <option value="medium">متوسط</option>
              <option value="low">پایین</option>
            </select>
          </div>
        )}
      </div>

      {/* Render Active View Tab */}
      <div>
        {activeTab === 'kanban' && (
          <KanbanBoard 
            projectId={project.id} 
            filterAssignee={filterAssignee} 
            filterPriority={filterPriority} 
          />
        )}
        {runtime.demoMode && activeTab === 'list' && (
          <ProjectListView 
            projectId={project.id} 
            filterAssignee={filterAssignee} 
            filterPriority={filterPriority} 
          />
        )}
        {!runtime.demoMode && activeTab === 'list' && <RelatedRecords module="tasks" scope={{project_id:project.id}} />}
        {activeTab === 'calendar' && (
          <ProjectCalendarView 
            projectId={project.id} 
            filterAssignee={filterAssignee} 
          />
        )}
        {hasPermission('assets.view') && activeTab === 'assets' && (
          /^\d+$/.test(project.id) ? <DamLibrary context={{ project_id: Number(project.id) }} /> : <p className="text-sm text-slate-500">برای ثبت دارایی، ابتدا پروژه را در سرور ذخیره کنید.</p>
        )}
        {!runtime.demoMode && activeTab === 'contents' && <RelatedRecords module="contents" scope={{project_id:project.id}} />}
        {runtime.demoMode && activeTab === 'contents' && (
          <div className="space-y-3">
            {projectContents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-500">محتوایی به این پروژه متصل نیست.</p>
                <p className="text-[11px] text-slate-400 mt-1">از صفحه ویرایش محتوا می‌توانید آن را به این پروژه متصل کنید.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {projectContents.map(content => {
                  const contentTasks = tasks.filter(t => t.contentId === content.id);
                  const doneTasks = contentTasks.filter(t => t.status === 'completed').length;
                  return (
                    <button
                      key={content.id}
                      onClick={() => {
                        setSelectedContentId(content.id);
                        setActiveView('content-detail');
                      }}
                      className="bg-white rounded-2xl border border-slate-200 p-4 text-right hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-extrabold text-slate-900 line-clamp-1">{content.title}</p>
                        {getContentStatusBadge(content.status)}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
                        {content.description || 'بدون توضیح'}
                      </p>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-600">
                          {contentTasks.length > 0 ? `${doneTasks} از ${contentTasks.length} تسک انجام‌شده` : 'بدون تسک'}
                        </span>
                        <span className="text-purple-600 font-bold">مشاهده محتوا ←</span>
                      </div>
                      {contentTasks.length > 0 && (
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${Math.round((doneTasks / contentTasks.length) * 100)}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Project Confirmation Dialog */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in zoom-in-95 duration-200 text-right">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="font-extrabold text-slate-900 text-base">
                حذف پروژه از سامانه تدبیر
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                آیا از حذف قطعی پروژه <span className="font-bold text-slate-900">«{project.name}» [{project.key}]</span> اطمینان دارید؟
              </p>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-[11px] text-rose-700 leading-relaxed">
                تمام وظایف، تسک‌ها، لاگ‌ها و مستندات مربوط به این پروژه به طور دائم حذف خواهند شد.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>بله، حذف قطعی</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
