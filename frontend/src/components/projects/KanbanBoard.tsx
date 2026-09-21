import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task, TaskStatus, Priority } from '../../types';
import { PriorityPill } from '../common/PriorityPill';
import { Avatar } from '../common/Avatar';
import {
  Plus,
  MoreHorizontal,
  CheckCircle2,
  Paperclip,
  MessageSquare,
  AlertTriangle,
  Clock,
  CheckSquare,
  Calendar
} from 'lucide-react';

interface KanbanColumn {
  id: TaskStatus;
  title: string;
  color: string;
  dotColor: string;
  badgeBg: string;
}

const COLUMNS: KanbanColumn[] = [
  {
    id: 'backlog',
    title: 'بک‌لاگ (ایده‌ها و نیازها)',
    color: 'border-slate-300',
    dotColor: 'bg-slate-400',
    badgeBg: 'bg-slate-100 text-slate-700'
  },
  {
    id: 'todo',
    title: 'برای انجام (To Do)',
    color: 'border-indigo-300',
    dotColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-100 text-indigo-700'
  },
  {
    id: 'in_progress',
    title: 'در حال انجام (In Progress)',
    color: 'border-blue-300',
    dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100 text-blue-700'
  },
  {
    id: 'review',
    title: 'در حال بررسی و کنترل (Review)',
    color: 'border-purple-300',
    dotColor: 'bg-purple-500',
    badgeBg: 'bg-purple-100 text-purple-700'
  },
  {
    id: 'completed',
    title: 'تکمیل شده (Done)',
    color: 'border-emerald-300',
    dotColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-100 text-emerald-700'
  }
];

export const KanbanBoard: React.FC<{ projectId: string; filterAssignee?: string; filterPriority?: string }> = ({
  projectId,
  filterAssignee = 'all',
  filterPriority = 'all'
}) => {
  const {
    tasks,
    users,
    projects,
    moveTaskStatus,
    setSelectedTaskId,
    addTask,
    setIsCreateTaskOpen
  } = useApp();

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [quickAddColumn, setQuickAddColumn] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  // Filter tasks for this project
  const projectTasks = tasks.filter(t => {
    const matchesProj = t.projectId === projectId;
    const matchesAssignee = filterAssignee === 'all' || t.assigneeId === filterAssignee;
    const matchesPriority = filterPriority === 'all' || t.priority === filterPriority;
    return matchesProj && matchesAssignee && matchesPriority;
  });

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (taskId) {
      moveTaskStatus(taskId, colId);
    }
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const handleQuickAddSubmit = (status: TaskStatus) => {
    if (!quickAddTitle.trim()) return;
    addTask({
      title: quickAddTitle.trim(),
      projectId,
      status,
      priority: 'medium'
    });
    setQuickAddTitle('');
    setQuickAddColumn(null);
  };

  return (
    <div className="overflow-x-auto pb-6 text-right snap-x snap-mandatory">
      <div className="flex gap-5 w-max items-start pr-4 sm:pr-0 pl-4 sm:pl-0">
        {COLUMNS.map(column => {
          const colTasks = projectTasks.filter(t => t.status === column.id);
          const isDraggingOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              id={`kanban-column-${column.id}`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
              className={`w-72 sm:w-80 shrink-0 rounded-3xl bg-slate-100/80 border transition-all flex flex-col max-h-[calc(100vh-230px)] snap-center sm:snap-align-none ${
                isDraggingOver ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200/90'
              }`}
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-slate-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${column.dotColor}`} />
                  <h3 className="text-xs font-extrabold text-slate-800 tracking-tight">
                    {column.title}
                  </h3>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full font-mono ${column.badgeBg}`}>
                    {colTasks.length}
                  </span>
                </div>

                <button
                  onClick={() => setQuickAddColumn(column.id)}
                  title="افزودن سریع وظیفه در این ستون"
                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Tasks List */}
              <div className="p-3 overflow-y-auto space-y-3 flex-1 min-h-[150px]">
                {/* Quick Add Form in Column */}
                {quickAddColumn === column.id && (
                  <div className="p-3 bg-white rounded-2xl border-2 border-indigo-500 shadow-md animate-in fade-in zoom-in-95 duration-100 space-y-2">
                    <textarea
                      autoFocus
                      rows={2}
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleQuickAddSubmit(column.id);
                        }
                        if (e.key === 'Escape') {
                          setQuickAddColumn(null);
                        }
                      }}
                      placeholder="عنوان وظیفه جدید را بنویسید..."
                      className="w-full text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden resize-none"
                    />
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => setQuickAddColumn(null)}
                        className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                      >
                        انصراف
                      </button>
                      <button
                        onClick={() => handleQuickAddSubmit(column.id)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                      >
                        افزودن
                      </button>
                    </div>
                  </div>
                )}

                {colTasks.map(task => {
                  const assignee = users.find(u => u.id === task.assigneeId);
                  const isBeingDragged = draggedTaskId === task.id;
                  const completedSubtasks = task.subtasks.filter(s => s.completed).length;

                  return (
                    <div
                      key={task.id}
                      id={`kanban-card-${task.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all cursor-grab active:cursor-grabbing group ${
                        isBeingDragged ? 'opacity-40 ring-2 ring-indigo-500' : ''
                      } ${task.isBlocked ? 'border-r-4 border-r-rose-500' : ''}`}
                    >
                      {/* Priority and Tags */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <PriorityPill priority={task.priority} size="sm" />
                        {task.isBlocked && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-sm border border-rose-200">
                            <AlertTriangle className="w-3 h-3" />
                            <span>مسدود شده</span>
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug mb-2 line-clamp-2">
                        {task.title}
                      </h4>

                      {/* Tag Chips */}
                      {task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {task.tags.map(t => (
                            <span key={t} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Footer meta: Subtasks, Comments, Attachments & Assignee */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
                        <div className="flex items-center gap-3">
                          {task.subtasks.length > 0 && (
                            <span 
                              className={`flex items-center gap-1 font-medium ${
                                completedSubtasks === task.subtasks.length ? 'text-emerald-600' : 'text-slate-500'
                              }`}
                              title="زیروظایف"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span className="font-mono">{completedSubtasks}/{task.subtasks.length}</span>
                            </span>
                          )}

                          {task.comments.length > 0 && (
                            <span className="flex items-center gap-1" title="دیدگاه‌ها">
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span className="font-mono">{task.comments.length}</span>
                            </span>
                          )}

                          {task.attachments.length > 0 && (
                            <span className="flex items-center gap-1" title="پیوست‌ها">
                              <Paperclip className="w-3.5 h-3.5" />
                              <span className="font-mono">{task.attachments.length}</span>
                            </span>
                          )}
                        </div>

                        <Avatar user={assignee} size="xs" showTooltip />
                      </div>
                    </div>
                  );
                })}

                {colTasks.length === 0 && quickAddColumn !== column.id && (
                  <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                    تسک‌ها را اینجا بکشید و رها کنید
                  </div>
                )}
              </div>

              {/* Column Footer Quick Add */}
              <div className="p-2 border-t border-slate-200/50">
                <button
                  onClick={() => setQuickAddColumn(column.id)}
                  className="w-full py-1.5 px-3 rounded-xl text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-white/80 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن وظیفه</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
