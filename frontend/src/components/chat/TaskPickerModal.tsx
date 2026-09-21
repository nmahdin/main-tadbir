import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task, TaskReference, ProjectReference } from '../../types';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { Search, CheckSquare, X, FolderKanban, ArrowRight } from 'lucide-react';

interface TaskPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask: (taskRef: TaskReference) => void;
  onSelectProject?: (projRef: ProjectReference) => void;
}

export const TaskPickerModal: React.FC<TaskPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectTask,
  onSelectProject
}) => {
  const { tasks, projects, users } = useApp();
  const [activeTab, setActiveTab] = useState<'tasks' | 'projects'>('tasks');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredTasks = tasks.filter(t => {
    const proj = projects.find(p => p.id === t.projectId);
    const matchesSearch =
      !searchTerm ||
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (proj && proj.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const filteredProjects = projects.filter(p => {
    return (
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.key.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleTaskClick = (task: Task) => {
    const proj = projects.find(p => p.id === task.projectId);
    const assignee = users.find(u => u.id === task.assigneeId);
    onSelectTask({
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      projectName: proj?.name,
      assigneeName: assignee?.name
    });
    onClose();
  };

  const handleProjectClick = (proj: any) => {
    if (onSelectProject) {
      onSelectProject({
        projectId: proj.id,
        name: proj.name,
        key: proj.key,
        color: proj.color,
        status: proj.status,
        progress: proj.progress
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 text-right" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                پیوست تسک یا پروژه به پیام
              </h3>
              <p className="text-[11px] text-slate-500">
                برای ارجاع مستقیم اعضا به وظیفه مورد نظر
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-4 pt-3 flex gap-2">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'tasks'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>وظایف (تسک‌ها)</span>
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'projects'
                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>پروژه‌ها</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === 'tasks'
                  ? 'جستجوی عنوان تسک یا نام پروژه...'
                  : 'جستجوی نام یا کلید پروژه...'
              }
              className="w-full pr-9 pl-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="p-3 overflow-y-auto flex-1 space-y-2">
          {activeTab === 'tasks' ? (
            filteredTasks.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                تسک مورد نظری یافت نشد
              </div>
            ) : (
              filteredTasks.map(task => {
                const proj = projects.find(p => p.id === task.projectId);
                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="p-3 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:bg-indigo-50/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                          {proj?.name || 'بدون پروژه'}
                        </span>
                        <PriorityPill priority={task.priority} size="sm" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {task.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <TaskStatusBadge status={task.status} size="sm" />
                      <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        انتخاب
                      </span>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            filteredProjects.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                پروژه‌ای یافت نشد
              </div>
            ) : (
              filteredProjects.map(proj => (
                <div
                  key={proj.id}
                  onClick={() => handleProjectClick(proj)}
                  className="p-3 rounded-2xl border border-slate-200/80 hover:border-purple-400 hover:bg-purple-50/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-md shrink-0"
                      style={{ backgroundColor: proj.color }}
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate">
                        {proj.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">[{proj.key}]</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold text-slate-600 font-mono">
                      {proj.progress}٪
                    </span>
                    <span className="text-xs font-bold text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      انتخاب
                    </span>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};
