import React, { useState } from 'react';
import { X, FolderKanban, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { Idea, Priority } from '../../types';
import { useApp } from '../../context/AppContext';

interface ConvertToProjectModalProps {
  idea: Idea | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
}

export const ConvertToProjectModal: React.FC<ConvertToProjectModalProps> = ({
  idea,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { convertIdeaToProject, setActiveView, setSelectedProjectId } = useApp();

  const [projectName, setProjectName] = useState(idea ? `پروژه: ${idea.title}` : '');
  const [projectKey, setProjectKey] = useState(idea ? idea.code.replace('-', '') : 'PRJ');
  const [projectDescription, setProjectDescription] = useState(
    idea ? `${idea.description || ''}\n\nمسئله حل‌شده:\n${idea.problemSolved}\n\nراه‌حل پیشنهادی:\n${idea.proposedSolution}` : ''
  );

  if (!isOpen || !idea) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const createdProj = convertIdeaToProject(idea.id, {
      name: projectName.trim(),
      key: projectKey.trim(),
      description: projectDescription.trim()
    });

    if (onSuccess) onSuccess(createdProj.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-r from-emerald-900 to-teal-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">تبدیل ایده به پروژه سازمانی</h2>
              <p className="text-xs text-emerald-200">انتقال مصوبه اتاق فکر به چرخه اجرای پروژه</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-emerald-200 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>ایده «{idea.title}» به وضعیت «در حال پیاده‌سازی» تغییر یافته و به عنوان پروژه تعریف می‌شود.</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              نام رسمی پروژه <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              کلید اختصاری پروژه (Key) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 uppercase font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اهداف و منشور پروژه
            </label>
            <textarea
              rows={4}
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500"
            />
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
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ایجاد رسمی پروژه</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
