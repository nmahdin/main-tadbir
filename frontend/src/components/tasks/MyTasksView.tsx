import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { Task, TaskStatus, Priority } from '../../types';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { Avatar } from '../common/Avatar';
import {
  CheckSquare,
  Plus,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  CheckCircle,
  LayoutGrid,
  List,
  MoreVertical,
  Clock
} from 'lucide-react';

export const MyTasksView: React.FC = () => {
  const {
    currentUser,
    tasks,
    projects,
    setSelectedTaskId,
    moveTaskStatus,
    setIsCreateTaskOpen
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'today' | 'overdue' | 'week'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const todayStr = new Date().toISOString().split('T')[0];

  // My tasks
  const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);

  const filteredTasks = myTasks.filter(t => {
    const matchesSearch =
      !searchTerm ||
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;

    let matchesTimeframe = true;
    if (timeframeFilter === 'today') {
      matchesTimeframe = t.deadline === todayStr;
    } else if (timeframeFilter === 'overdue') {
      matchesTimeframe = t.status !== 'completed' && t.deadline < todayStr;
    } else if (timeframeFilter === 'week') {
      const taskDate = new Date(t.deadline).getTime();
      const now = new Date().getTime();
      matchesTimeframe = taskDate >= now && taskDate <= now + 7 * 86400000;
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesTimeframe;
  });

  const overdueCount = myTasks.filter(t => t.status !== 'completed' && t.deadline < todayStr).length;
  const inProgressCount = myTasks.filter(t => t.status === 'in_progress').length;
  const completedCount = myTasks.filter(t => t.status === 'completed').length;
  const todoCount = myTasks.filter(t => t.status === 'todo').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right pb-20" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-indigo-600" />
            <span>وظایف من</span>
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            مدیریت وظایف محول شده، پیگیری موعدهای مقرر و اولویت‌بندی کارها
          </p>
        </div>
        <button
          onClick={() => setIsCreateTaskOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>وظیفه جدید</span>
        </button>
      </div>

      {/* Stats KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => { setTimeframeFilter('all'); setStatusFilter('all'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            timeframeFilter === 'all' && statusFilter === 'all'
              ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-slate-600">کل وظایف</span>
            <ListTodo className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-2xl font-black text-slate-900">{myTasks.length}</span>
        </button>

        <button
          onClick={() => { setTimeframeFilter('all'); setStatusFilter('in_progress'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            statusFilter === 'in_progress'
              ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-indigo-700">در حال انجام</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-2xl font-black text-indigo-700">{inProgressCount}</span>
        </button>

        <button
          onClick={() => { setTimeframeFilter('overdue'); setStatusFilter('all'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            timeframeFilter === 'overdue'
              ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-rose-700">تأخیردار</span>
            {overdueCount > 0 && <AlertTriangle className="w-4 h-4 text-rose-600" />}
          </div>
          <span className="text-2xl font-black text-rose-600">{overdueCount}</span>
        </button>

        <button
          onClick={() => { setTimeframeFilter('all'); setStatusFilter('completed'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            statusFilter === 'completed'
              ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-emerald-700">تکمیل‌شده</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-2xl font-black text-emerald-600">{completedCount}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در وظایف..."
            className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
          />
        </div>
        
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="todo">برای انجام</option>
              <option value="in_progress">در حال انجام</option>
              <option value="review">در حال بررسی</option>
              <option value="completed">تکمیل‌شده</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">همه اولویت‌ها</option>
              <option value="urgent">فوری</option>
              <option value="high">بالا</option>
              <option value="medium">متوسط</option>
              <option value="low">پایین</option>
            </select>
          </div>
          
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}
              title="نمایش لیستی"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}
              title="نمایش کانبان"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Task Content Area */}
      {filteredTasks.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 border-dashed">
          <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-900 mb-1">وظیفه‌ای یافت نشد</h3>
          <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
            هیچ وظیفه‌ای با فیلترهای فعلی شما مطابقت ندارد یا تمام کارهای خود را انجام داده‌اید!
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right text-slate-600">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-bold rounded-tr-3xl">عنوان وظیفه</th>
                  <th scope="col" className="px-6 py-4 font-bold">پروژه مرتبط</th>
                  <th scope="col" className="px-6 py-4 font-bold">وضعیت</th>
                  <th scope="col" className="px-6 py-4 font-bold">اولویت</th>
                  <th scope="col" className="px-6 py-4 font-bold">سررسید</th>
                  <th scope="col" className="px-6 py-4 font-bold rounded-tl-3xl text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map(task => {
                  const proj = projects.find(p => p.id === task.projectId);
                  const isPastDue = task.status !== 'completed' && task.deadline < todayStr;
                  const isCompleted = task.status === 'completed';
                  return (
                    <tr 
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer group ${isCompleted ? 'bg-slate-50/50' : ''}`}
                    >
                      <td className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveTaskStatus(task.id, isCompleted ? 'todo' : 'completed');
                            }}
                            className={`w-5 h-5 rounded-md border-2 transition-colors flex items-center justify-center shrink-0 cursor-pointer ${
                              isCompleted
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-slate-300 hover:border-emerald-500 bg-white'
                            }`}
                          >
                            {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                          <span className={`${isCompleted ? 'line-through text-slate-500 font-medium' : ''}`}>
                            {task.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {proj ? (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: proj.color }}></span>
                            <span className="font-bold">{proj.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <TaskStatusBadge status={task.status} size="sm" />
                      </td>
                      <td className="px-6 py-4">
                        <PriorityPill priority={task.priority} size="sm" />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 font-bold text-xs ${
                          isPastDue ? 'text-rose-600 bg-rose-50 px-2 py-1 rounded-lg' : 'text-slate-600'
                        }`}>
                          <Calendar className="w-4 h-4" />
                          <span dir="ltr">{formatPersianDate(task.deadline)}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* KANBAN VIEW */
        <div className="flex items-start gap-4 overflow-x-auto pb-4 snap-x">
          {['todo', 'in_progress', 'review', 'completed'].map((colStatus) => {
            const colTasks = filteredTasks.filter(t => t.status === colStatus);
            const statusLabels: Record<string, { label: string, color: string }> = {
              'todo': { label: 'برای انجام', color: 'border-slate-300' },
              'in_progress': { label: 'در حال انجام', color: 'border-indigo-400' },
              'review': { label: 'در حال بررسی', color: 'border-amber-400' },
              'completed': { label: 'تکمیل‌شده', color: 'border-emerald-400' }
            };
            return (
              <div key={colStatus} className="min-w-[280px] sm:min-w-[320px] w-full max-w-sm flex flex-col shrink-0 snap-center bg-slate-50/50 rounded-3xl p-3 border border-slate-200">
                <div className={`flex items-center justify-between mb-4 px-2 border-r-4 ${statusLabels[colStatus].color}`}>
                  <h3 className="text-sm font-extrabold text-slate-800 pr-2">{statusLabels[colStatus].label}</h3>
                  <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  {colTasks.map(task => {
                    const proj = projects.find(p => p.id === task.projectId);
                    return (
                      <div 
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <PriorityPill priority={task.priority} size="sm" />
                          {proj && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {proj.key}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-extrabold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors leading-tight">
                          {task.title}
                        </h4>
                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                          <span className={`text-[10px] font-bold flex items-center gap-1 ${task.deadline < todayStr && task.status !== 'completed' ? 'text-rose-600' : 'text-slate-500'}`}>
                            <Calendar className="w-3.5 h-3.5" />
                            {formatPersianDate(task.deadline)}
                          </span>
                          {task.estimatedHours && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                              {task.estimatedHours}h
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center">
                      <span className="text-xs font-medium text-slate-400">خالی</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
