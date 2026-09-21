import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { Task, TaskStatus, Priority } from '../../types';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { Avatar } from '../common/Avatar';
import { 
  CheckCircle2, 
  Clock, 
  Calendar, 
  ArrowUpDown, 
  CheckSquare, 
  AlertTriangle,
  MoreHorizontal,
  Trash2,
  Edit,
  ChevronDown
} from 'lucide-react';

export const ProjectListView: React.FC<{ projectId: string; filterAssignee?: string; filterPriority?: string }> = ({
  projectId,
  filterAssignee = 'all',
  filterPriority = 'all'
}) => {
  const { tasks, users, moveTaskStatus, setSelectedTaskId, deleteTask } = useApp();
  const [sortField, setSortField] = useState<'title' | 'deadline' | 'priority' | 'status'>('deadline');
  const [sortAsc, setSortAsc] = useState(true);

  const projectTasks = tasks.filter(t => {
    const matchesProj = t.projectId === projectId;
    const matchesAssignee = filterAssignee === 'all' || t.assigneeId === filterAssignee;
    const matchesPriority = filterPriority === 'all' || t.priority === filterPriority;
    return matchesProj && matchesAssignee && matchesPriority;
  });

  const sortedTasks = [...projectTasks].sort((a, b) => {
    if (sortField === 'title') {
      return sortAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title);
    }
    if (sortField === 'deadline') {
      return sortAsc 
        ? new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        : new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
    }
    if (sortField === 'priority') {
      const pMap: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      return sortAsc ? pMap[a.priority] - pMap[b.priority] : pMap[b.priority] - pMap[a.priority];
    }
    if (sortField === 'status') {
      return sortAsc ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
    }
    return 0;
  });

  const toggleSort = (field: 'title' | 'deadline' | 'priority' | 'status') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'backlog':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'todo':
        return 'bg-amber-50 text-amber-700 border-amber-300';
      case 'in_progress':
        return 'bg-blue-50 text-blue-700 border-blue-300';
      case 'review':
        return 'bg-purple-50 text-purple-700 border-purple-300';
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold select-none">
            <tr>
              <th className="w-12 px-4 py-3.5 text-center">انجام</th>
              <th 
                className="px-4 py-3.5 cursor-pointer hover:text-slate-900"
                onClick={() => toggleSort('title')}
              >
                <div className="flex items-center gap-1.5">
                  <span>عنوان وظیفه (تسک)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="px-4 py-3.5">مسئول اجرا</th>
              <th 
                className="px-4 py-3.5 cursor-pointer hover:text-slate-900"
                onClick={() => toggleSort('status')}
              >
                <div className="flex items-center gap-1.5">
                  <span>وضعیت تسک (تغییر مستقیم)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th 
                className="px-4 py-3.5 cursor-pointer hover:text-slate-900"
                onClick={() => toggleSort('priority')}
              >
                <div className="flex items-center gap-1.5">
                  <span>اولویت</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th 
                className="px-4 py-3.5 cursor-pointer hover:text-slate-900"
                onClick={() => toggleSort('deadline')}
              >
                <div className="flex items-center gap-1.5">
                  <span>سررسید</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="px-4 py-3.5">زیروظایف</th>
              <th className="px-6 py-3.5 text-left">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                  هیچ وظیفه‌ای با فیلترهای انتخابی یافت نشد.
                </td>
              </tr>
            ) : (
              sortedTasks.map(task => {
                const assignee = users.find(u => u.id === task.assigneeId);
                const isCompleted = task.status === 'completed';
                const completedSubtasks = task.subtasks.filter(s => s.completed).length;

                return (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                      isCompleted ? 'bg-slate-50/40 text-slate-500' : ''
                    }`}
                  >
                    {/* Done toggle checkbox */}
                    <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => moveTaskStatus(task.id, isCompleted ? 'todo' : 'completed')}
                        title={isCompleted ? 'علامت‌گذاری به عنوان در حال انجام' : 'علامت‌گذاری به عنوان تکمیل شده'}
                        className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center cursor-pointer mx-auto ${
                          isCompleted
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                            : 'border-slate-300 hover:border-emerald-500 bg-white'
                        }`}
                      >
                        {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>

                    {/* Title */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-xs sm:text-sm ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                          {task.title}
                        </span>
                        {task.isBlocked && (
                          <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-sm border border-rose-200 font-bold">
                            مسدود شده
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Assignee */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Avatar user={assignee} size="xs" />
                        <span className="truncate max-w-[120px] font-semibold text-slate-800">{assignee?.name}</span>
                      </div>
                    </td>

                    {/* DIRECT STATUS CHANGER DROPDOWN */}
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <select
                          value={task.status}
                          onChange={(e) => moveTaskStatus(task.id, e.target.value as TaskStatus)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer appearance-none pl-6 pr-2.5 focus:outline-hidden shadow-2xs transition-all ${getStatusColor(task.status)}`}
                        >
                          <option value="backlog">📋 بک‌لاگ (Backlog)</option>
                          <option value="todo">📌 برای انجام (To Do)</option>
                          <option value="in_progress">⏳ در حال انجام (In Progress)</option>
                          <option value="review">🔍 در حال بررسی (Review)</option>
                          <option value="completed">✅ تکمیل شده (Done)</option>
                        </select>
                        <ChevronDown className="w-3 h-3 text-slate-500 absolute left-2 top-2 pointer-events-none" />
                      </div>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3.5">
                      <PriorityPill priority={task.priority} size="sm" />
                    </td>

                    {/* Deadline */}
                    <td className="px-4 py-3.5 text-slate-600">
                      <span className="font-semibold text-slate-800 font-mono">{formatPersianDate(task.deadline)}</span>
                    </td>

                    {/* Subtasks */}
                    <td className="px-4 py-3.5">
                      {task.subtasks.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-700">
                            {completedSubtasks}/{task.subtasks.length}
                          </span>
                          <span className="text-[10px] text-slate-600">
                            ({Math.round((completedSubtasks / task.subtasks.length) * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-3.5 text-left" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedTaskId(task.id)}
                          title="مشاهده و ویرایش جزئیات"
                          className="p-1.5 text-slate-600 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteTask(task.id)}
                          title="حذف تسک"
                          className="p-1.5 text-slate-600 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
  );
};
