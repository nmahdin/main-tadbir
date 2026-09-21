import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { ProjectStatusBadge, PriorityPill } from '../common/PriorityPill';
import { AvatarGroup, ProgressBar, Avatar } from '../common/Avatar';
import { ProjectStatus, Project } from '../../types';
import {
  FolderKanban,
  Plus,
  Search,
  LayoutGrid,
  List,
  Clock,
  ArrowUpRight,
  Layers,
  Sparkles,
  Edit,
  Trash2,
  MoreVertical,
  ChevronDown,
  AlertTriangle,
  MessageSquare,
  X
} from 'lucide-react';

export const ProjectsView: React.FC = () => {
  const {
    projects,
    tasks,
    users,
    currentUser,
    setSelectedProjectId,
    setActiveView,
    setIsCreateProjectOpen,
    openEditProject,
    updateProject,
    deleteProject,
    setIsTemplatesModalOpen,
    openProjectChannel
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const canCreateProject = currentUser.role === 'admin' || currentUser.role === 'project_manager' || currentUser.role === 'team_lead';

  const filteredProjects = projects.filter(p => {
    const matchesSearch =
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || p.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const handleOpenProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveView('project-detail');
  };

  const handleConfirmDelete = () => {
    if (!projectToDelete) return;
    deleteProject(projectToDelete.id);
    setProjectToDelete(null);
  };

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'planning':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'active':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'on_hold':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'cancelled':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right" dir="rtl">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                مدیریت و سبد پروژه‌ها
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                نظارت بر اسپرینت‌ها، درصد پیشرفت، ددلاین‌ها و هماهنگی اعضای تیم
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsTemplatesModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs sm:text-sm border border-purple-200 transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <Layers className="w-4 h-4 text-purple-600" />
            <span>الگوهای آماده پروژه</span>
          </button>

          {canCreateProject && (
            <button
              id="projects-create-btn"
              onClick={() => setIsCreateProjectOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد پروژه جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and View Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="فیلتر بر اساس نام پروژه، توضیحات یا برچسب‌ها..."
            className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Filters and View mode */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="planning">در مرحله برنامه‌ریزی</option>
            <option value="active">در حال اجرا (فعال)</option>
            <option value="on_hold">متوقف شده (معلق)</option>
            <option value="completed">تکمیل شده</option>
            <option value="cancelled">لغو شده</option>
          </select>

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="all">همه اولویت‌ها</option>
            <option value="urgent">فوری</option>
            <option value="high">بالا</option>
            <option value="medium">متوسط</option>
            <option value="low">پایین</option>
          </select>

          {/* Grid / Table Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="نمای کارتی"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-indigo-600 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="نمای جدولی"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Projects Display */}
      {filteredProjects.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-slate-200/80">
          <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">پروژه‌ای مطابق با فیلترها یافت نشد</h3>
          <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
            عبارت جستجو یا فیلتر وضعیت را بررسی کرده یا پروژه جدیدی بسازید.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map(proj => {
            const members = users.filter(u => proj.memberIds.includes(u.id));
            const projTasks = tasks.filter(t => t.projectId === proj.id);
            const completedCount = projTasks.filter(t => t.status === 'completed').length;

            return (
              <div
                key={proj.id}
                onClick={() => handleOpenProject(proj.id)}
                className="bg-white rounded-3xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-lg transition-all p-6 flex flex-col justify-between cursor-pointer group relative overflow-hidden"
              >
                {/* Top color bar indicator */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1.5 transition-all group-hover:h-2"
                  style={{ backgroundColor: proj.color }}
                />

                <div>
                  {/* Top line with Key, badges and edit/delete buttons */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span 
                        className="px-2 py-0.5 rounded-md text-white text-[11px] font-bold tracking-wider"
                        style={{ backgroundColor: proj.color }}
                      >
                        {proj.key}
                      </span>
                      <PriorityPill priority={proj.priority} size="sm" />
                    </div>
                    
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <ProjectStatusBadge status={proj.status} size="sm" />
                      <button
                        onClick={() => openEditProject(proj)}
                        title="ویرایش پروژه"
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setProjectToDelete(proj)}
                        title="حذف پروژه"
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 mb-1.5">
                    {proj.name}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-4">
                    {proj.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {proj.tags.map(t => (
                      <span key={t} className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom Section: Progress & Meta */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <ProgressBar progress={proj.progress} color={proj.color} size="md" showLabel />

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>سررسید: {formatPersianDate(proj.deadline)}</span>
                    </div>
                    <span className="font-bold text-slate-700">
                      {completedCount} از {projTasks.length} تسک
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-medium">تیم:</span>
                      <AvatarGroup users={members} max={3} size="xs" />
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openProjectChannel(proj.id)}
                        title="ورود به کانال چت پروژه"
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditProject(proj)}
                        className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      >
                        ویرایش
                      </button>
                      <button
                        onClick={() => setProjectToDelete(proj)}
                        className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        حذف
                      </button>
                      <button
                        onClick={() => handleOpenProject(proj.id)}
                        className="text-xs font-bold text-indigo-600 group-hover:-translate-x-1 transition-transform flex items-center gap-1 pr-1 cursor-pointer"
                      >
                        <span>ورود</span>
                        <ArrowUpRight className="w-3.5 h-3.5 rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">نام پروژه</th>
                  <th className="px-4 py-3.5">وضعیت (تغییر مستقیم)</th>
                  <th className="px-4 py-3.5">اولویت</th>
                  <th className="px-4 py-3.5">مدیر پروژه</th>
                  <th className="px-4 py-3.5">اعضا</th>
                  <th className="px-4 py-3.5">پیشرفت</th>
                  <th className="px-4 py-3.5">سررسید</th>
                  <th className="px-6 py-3.5 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredProjects.map(proj => {
                  const pm = users.find(u => u.id === proj.projectManagerId);
                  const members = users.filter(u => proj.memberIds.includes(u.id));
                  return (
                    <tr 
                      key={proj.id}
                      onClick={() => handleOpenProject(proj.id)}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span 
                            className="w-2.5 h-2.5 rounded-xs shrink-0" 
                            style={{ backgroundColor: proj.color }}
                          />
                          <div>
                            <div className="font-bold text-slate-900">{proj.name}</div>
                            <span className="text-[10px] font-mono text-slate-500">[{proj.key}]</span>
                          </div>
                        </div>
                      </td>

                      {/* Direct Status Change in Project Table */}
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <select
                            value={proj.status}
                            onChange={(e) => updateProject(proj.id, { status: e.target.value as ProjectStatus })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer appearance-none pl-6 pr-2.5 focus:outline-hidden shadow-2xs ${getStatusColor(proj.status)}`}
                          >
                            <option value="planning">📋 در مرحله برنامه‌ریزی</option>
                            <option value="active">⚡ در حال اجرا (فعال)</option>
                            <option value="on_hold">⏸ متوقف شده (معلق)</option>
                            <option value="completed">✅ تکمیل شده</option>
                            <option value="cancelled">❌ لغو شده</option>
                          </select>
                          <ChevronDown className="w-3 h-3 text-slate-500 absolute left-2 top-2 pointer-events-none" />
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <PriorityPill priority={proj.priority} size="sm" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Avatar user={pm} size="xs" />
                          <span className="truncate max-w-[100px]">{pm?.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <AvatarGroup users={members} max={3} size="xs" />
                      </td>
                      <td className="px-4 py-4 w-36">
                        <ProgressBar progress={proj.progress} color={proj.color} size="sm" />
                        <span className="text-[10px] font-bold text-slate-600 mt-1 block">
                          {proj.progress}٪
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-600 font-medium font-mono">
                        {formatPersianDate(proj.deadline)}
                      </td>
                      <td className="px-6 py-4 text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Chat Channel */}
                          <button
                            onClick={() => openProjectChannel(proj.id)}
                            title="ورود به کانال چت پروژه"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          {/* Edit Project Button */}
                          <button
                            onClick={() => openEditProject(proj)}
                            title="ویرایش مشخصات پروژه"
                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>ویرایش</span>
                          </button>

                          {/* Delete Project Button with Confirmation Modal */}
                          <button
                            onClick={() => setProjectToDelete(proj)}
                            title="حذف پروژه"
                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>

                          {/* Open Project */}
                          <button
                            onClick={() => handleOpenProject(proj.id)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                          >
                            ورود
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

      {/* Delete Project Confirmation Dialog */}
      {projectToDelete && (
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
                آیا از حذف قطعی پروژه <span className="font-bold text-slate-900">«{projectToDelete.name}» [{projectToDelete.key}]</span> اطمینان دارید؟
              </p>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-[11px] text-rose-700 leading-relaxed">
                هشدار: با حذف این پروژه، تمام تسک‌ها، پیوست‌ها و تنظیمات مرتبط با آن حذف خواهند شد. این عمل قابل بازگشت نیست.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
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
                <span>بله، حذف قطعی پروژه</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
