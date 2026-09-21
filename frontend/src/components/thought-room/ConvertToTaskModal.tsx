import React, { useState } from 'react';
import { X, CheckSquare, FolderKanban, CheckCircle2 } from 'lucide-react';
import { Idea } from '../../types';
import { useApp } from '../../context/AppContext';

interface ConvertToTaskModalProps {
  idea: Idea | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (taskId: string) => void;
}

export const ConvertToTaskModal: React.FC<ConvertToTaskModalProps> = ({
  idea,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { projects, convertIdeaToTask } = useApp();

  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [taskTitle, setTaskTitle] = useState(idea ? `پیاده‌سازی ایده: ${idea.title}` : '');

  if (!isOpen || !idea) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    const createdTask = convertIdeaToTask(idea.id, selectedProjectId, taskTitle.trim());
    if (onSuccess) onSuccess(createdTask.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-r from-indigo-900 to-blue-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">تبدیل ایده به وظیفه (Task)</h2>
              <p className="text-xs text-indigo-200">افزودن این ایده به لیست کارهای یکی از پروژه‌ها</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-indigo-200 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عنوان وظیفه (تسک) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              پروژه مقصد <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              required
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ایجاد تسک</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
