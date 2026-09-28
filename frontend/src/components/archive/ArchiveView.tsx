import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { getContentStatusBadge } from '../../utils/statusBadges';
import { TaskStatusBadge, ProjectStatusBadge } from '../common/PriorityPill';
import {
  Archive,
  Search,
  RotateCcw,
  FolderKanban,
  CheckSquare,
  PenTool
} from 'lucide-react';

type ArchiveTab = 'contents' | 'projects' | 'tasks';

const TABS: { id: ArchiveTab; label: string; icon: React.ReactNode }[] = [
  { id: 'contents', label: 'محتواها', icon: <PenTool className="w-4 h-4" /> },
  { id: 'projects', label: 'پروژه‌ها', icon: <FolderKanban className="w-4 h-4" /> },
  { id: 'tasks', label: 'تسک‌ها', icon: <CheckSquare className="w-4 h-4" /> },
];

export const ArchiveView: React.FC = () => {
  const {
    contents,
    projects,
    tasks,
    users,
    setActiveView,
    setSelectedContentId,
    setSelectedProjectId,
    setSelectedTaskId,
    unarchiveItem
  } = useApp();
  const [activeTab, setActiveTab] = useState<ArchiveTab>('contents');
  const [searchTerm, setSearchTerm] = useState('');

  const archivedContents = contents.filter(c =>
    c.status === 'archived' && c.title.includes(searchTerm)
  );
  const archivedProjects = projects.filter(p =>
    p.status === 'archived' && p.name.includes(searchTerm)
  );
  const archivedTasks = tasks.filter(t =>
    t.status === 'archived' && t.title.includes(searchTerm)
  );

  const counts: Record<ArchiveTab, number> = {
    contents: archivedContents.length,
    projects: archivedProjects.length,
    tasks: archivedTasks.length
  };

  const userName = (id?: string) => users.find(u => u.id === id)?.name || 'نامشخص';

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-600 flex items-center justify-center text-white shadow-md shadow-slate-300">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">بایگانی</h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              آیتم‌های بایگانی‌شده را بازیابی یا بررسی کنید
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="جستجو در بایگانی..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap p-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xs w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 whitespace-nowrap">عنوان</th>
                <th className="p-4 whitespace-nowrap">وضعیت</th>
                <th className="p-4 whitespace-nowrap">مسئول</th>
                <th className="p-4 whitespace-nowrap">آخرین به‌روزرسانی</th>
                <th className="p-4 w-32 whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTab === 'contents' && archivedContents.map(content => (
                <tr key={content.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                      onClick={() => { setSelectedContentId(content.id); setActiveView('content-detail'); }}
                    >
                      {content.title}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{content.topic || 'بدون موضوع'}</p>
                  </td>
                  <td className="p-4">{getContentStatusBadge(content.status)}</td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(content.ownerId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(content.updatedAt)}</td>
                  <td className="p-4 text-left">
                    <button
                      type="button"
                      onClick={() => unarchiveItem('content', content.id)}
                      className="px-3 py-2 rounded-xl text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>بازیابی</span>
                    </button>
                  </td>
                </tr>
              ))}
              {activeTab === 'projects' && archivedProjects.map(project => (
                <tr key={project.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                      onClick={() => { setSelectedProjectId(project.id); setActiveView('project-detail'); }}
                    >
                      {project.name}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{project.key}</p>
                  </td>
                  <td className="p-4"><ProjectStatusBadge status={project.status} size="sm" /></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(project.projectManagerId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(project.deadline)}</td>
                  <td className="p-4 text-left">
                    <button
                      type="button"
                      onClick={() => unarchiveItem('project', project.id)}
                      className="px-3 py-2 rounded-xl text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>بازیابی</span>
                    </button>
                  </td>
                </tr>
              ))}
              {activeTab === 'tasks' && archivedTasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      {task.title}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{task.projectId || 'بدون پروژه'}</p>
                  </td>
                  <td className="p-4"><TaskStatusBadge status={task.status} size="sm" /></td>
                  <td className="p-4 text-xs font-medium text-slate-700">{userName(task.assigneeId)}</td>
                  <td className="p-4 text-xs text-slate-500">{formatPersianDate(task.updatedAt || task.deadline)}</td>
                  <td className="p-4 text-left">
                    <button
                      type="button"
                      onClick={() => unarchiveItem('task', task.id)}
                      className="px-3 py-2 rounded-xl text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>بازیابی</span>
                    </button>
                  </td>
                </tr>
              ))}
              {counts[activeTab] === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    <Archive className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-500">موردی در بایگانی یافت نشد.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
