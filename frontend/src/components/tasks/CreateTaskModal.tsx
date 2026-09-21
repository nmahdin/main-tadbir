import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { TaskStatus, Priority } from '../../types';
import { X, CheckSquare, Trash2, Plus, Calendar, Flag, User, Target, Tags, FileText } from 'lucide-react';
import { PersianDatePicker } from '../common/PersianDatePicker';

export const CreateTaskModal: React.FC = () => {
  const { isCreateTaskOpen, setIsCreateTaskOpen, projects, users, addTask, currentUser } = useApp();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [assigneeId, setAssigneeId] = useState(currentUser?.id || users[0]?.id || '');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  
  const [tagInput, setTagInput] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isCreateTaskOpen) {
      setTitle('');
      setProjectId(projects[0]?.id || '');
      setAssigneeId(currentUser?.id || users[0]?.id || '');
      setPriority('medium');
      setStatus('todo');
      setDeadline('');
      setDescription('');
      setSubtasks([]);
      setNewSubtask('');
      setTagInput('');
    }
  }, [isCreateTaskOpen, projects, users, currentUser]);

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([...subtasks, newSubtask.trim()]);
      setNewSubtask('');
    }
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId || !assigneeId) return;

    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);

    addTask({
      title: title.trim(),
      description: description.trim() || undefined,
      projectId,
      assigneeId,
      status,
      priority,
      deadline: deadline || undefined,
      subtasks: subtasks.map(title => ({
        id: `st-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title,
        completed: false
      })),
      tags: tags.length > 0 ? tags : undefined
    });

    setIsCreateTaskOpen(false);
  };

  if (!isCreateTaskOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">ایجاد وظیفه جدید</h3>
              <p className="text-[11px] text-slate-500 font-medium">وظیفه جدید را تعریف و به پروژه و فرد مربوطه اختصاص دهید.</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateTaskOpen(false)}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[75vh] space-y-6">
          
          {/* Main Title */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <Target className="w-4 h-4 text-slate-400" />
              <span>عنوان وظیفه *</span>
            </label>
            <input
              required
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: طراحی و پیاده‌سازی فرم ورود"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <CheckSquare className="w-4 h-4 text-slate-400" />
                <span>پروژه مرتبط *</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full pl-3 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden appearance-none transition-all"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                </div>
              </div>
            </div>
            
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <User className="w-4 h-4 text-slate-400" />
                <span>مسئول انجام *</span>
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} - {u.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <Flag className="w-4 h-4 text-slate-400" />
                <span>اولویت</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                <option value="low">پایین (Low)</option>
                <option value="medium">متوسط (Medium)</option>
                <option value="high">بالا (High)</option>
                <option value="urgent">فوری (Urgent)</option>
              </select>
            </div>
            
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <CheckSquare className="w-4 h-4 text-slate-400" />
                <span>وضعیت اولیه</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                <option value="backlog">بک‌لاگ (Backlog)</option>
                <option value="todo">برای انجام (To Do)</option>
                <option value="in_progress">در حال انجام (In Progress)</option>
                <option value="review">در حال بررسی (Review)</option>
                <option value="completed">انجام شده (Completed)</option>
              </select>
            </div>
            
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>مهلت انجام</span>
              </label>
              <PersianDatePicker
                value={deadline}
                onChange={(val) => setDeadline(val)}
                placeholder="انتخاب تاریخ"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span>توضیحات و جزئیات</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اهداف، محدودیت‌ها یا لینک‌های مرتبط با این وظیفه را بنویسید..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden resize-none transition-all"
            />
          </div>

          {/* Subtasks */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-3">
              <CheckSquare className="w-4 h-4 text-slate-400" />
              <span>چک‌لیست و زیروظایف</span>
            </label>
            
            {subtasks.length > 0 && (
              <div className="space-y-2 mb-3">
                {subtasks.map((st, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium shadow-2xs">
                    <span className="text-slate-700">{st}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(idx)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="مثلاً: طراحی ساختار دیتابیس..."
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن</span>
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <Tags className="w-4 h-4 text-slate-400" />
              <span>برچسب‌ها (با کاما جدا کنید)</span>
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="مثلاً: فرانت‌اند, فوری, جلسه"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsCreateTaskOpen(false)}
              className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md shadow-indigo-200 transition-all cursor-pointer flex items-center gap-2"
            >
              <CheckSquare className="w-5 h-5" />
              <span>ایجاد وظیفه جدید</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
