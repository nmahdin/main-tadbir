import React, { useState } from 'react';
import { 
  X, 
  Lightbulb, 
  Sparkles, 
  Building, 
  Clock, 
  DollarSign, 
  Tag, 
  Plus, 
  Trash2, 
  BarChart2, 
  Check, 
  AlertCircle,
  FolderKanban,
  Users2
} from 'lucide-react';
import { Priority } from '../../types';
import { useApp } from '../../context/AppContext';

interface CreateIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateIdeaModal: React.FC<CreateIdeaModalProps> = ({ isOpen, onClose }) => {
  const { addIdea, teams, projects } = useApp();

  const [title, setTitle] = useState('');
  const [problemSolved, setProblemSolved] = useState('');
  const [proposedSolution, setProposedSolution] = useState('');
  const [description, setDescription] = useState('');
  const [targetDepartment, setTargetDepartment] = useState('فناوری اطلاعات و توسعه');
  const [estimatedEffort, setEstimatedEffort] = useState('۲ تا ۳ هفته');
  const [estimatedBudget, setEstimatedBudget] = useState('نیاز به برآورد مالی');
  const [priority, setPriority] = useState<Priority>('medium');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tagsInput, setTagsInput] = useState('نوآوری, اتوماسیون');
  
  // Poll settings
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('آیا با اولویت اجرای این پیشنهاد در فصل جاری موافقید؟');
  const [pollOptions, setPollOptions] = useState<string[]>([
    'بله، کاملاً همسو با اهداف استراتژیک است',
    'با اولویت متوسط در برنامه کاری قرار گیرد',
    'نیازمند اصلاح و کاهش هزینه‌های اجرایی است'
  ]);

  if (!isOpen) return null;

  const handleAddPollOption = () => {
    setPollOptions([...pollOptions, '']);
  };

  const handleRemovePollOption = (idx: number) => {
    setPollOptions(pollOptions.filter((_, i) => i !== idx));
  };

  const handlePollOptionChange = (idx: number, val: string) => {
    const updated = [...pollOptions];
    updated[idx] = val;
    setPollOptions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !problemSolved.trim() || !proposedSolution.trim()) return;

    const tags = tagsInput
      .split(/[,،]+/)
      .map(t => t.trim())
      .filter(Boolean);

    addIdea({
      title: title.trim(),
      problemSolved: problemSolved.trim(),
      proposedSolution: proposedSolution.trim(),
      description: description.trim(),
      targetDepartment: targetDepartment.trim(),
      estimatedEffort: estimatedEffort.trim(),
      estimatedBudget: estimatedBudget.trim(),
      priority,
      teamId: teamId || undefined,
      projectId: projectId || undefined,
      tags,
      hasPoll: hasPoll,
      pollQuestion: hasPoll ? pollQuestion.trim() : undefined,
      pollOptions: hasPoll ? pollOptions.filter(o => o.trim()).map((text, idx) => ({
        id: `opt-${idx + 1}`,
        text: text.trim(),
        votes: []
      })) : undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-amber-300">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">ثبت ایده و پیشنهاد در اتاق فکر</h2>
              <p className="text-xs text-slate-300">طرح مسئله، راه‌حل خلاقانه و ارزیابی جمعی در سازمان</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              عنوان ایده یا طرح پیشنهادی <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: پیاده‌سازی دستیار هوش مصنوعی برای مستندسازی کدها"
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Problem & Solution in Two Boxes */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-amber-800 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                مسئله و چالش فعلی (چه مشکلی وجود دارد؟) <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={problemSolved}
                onChange={(e) => setProblemSolved(e.target.value)}
                placeholder="توضیح دهید در حال حاضر سازمان یا تیم با چه چالشی، اتلاف زمان یا نقص فرآیندی روبرو است..."
                className="w-full text-xs sm:text-sm p-3 rounded-xl border border-amber-300/80 bg-amber-50/30 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-800 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                راه‌حل پیشنهادی شما (چگونه حل شود؟) <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={proposedSolution}
                onChange={(e) => setProposedSolution(e.target.value)}
                placeholder="پیشنهاد دقیق شما چیست؟ چه ابزار، تغییر رویه یا سیستمی باید پیاده شود؟"
                className="w-full text-xs sm:text-sm p-3 rounded-xl border border-emerald-300/80 bg-emerald-50/30 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                واحد سازمانی مرتبط / هدف
              </label>
              <input
                type="text"
                value={targetDepartment}
                onChange={(e) => setTargetDepartment(e.target.value)}
                placeholder="مثال: منابع انسانی، مالی، مهندسی نرم‌افزار"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                اولویت پیشنهادی
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="low">عادی / اختیاری</option>
                <option value="medium">متوسط</option>
                <option value="high">بالا</option>
                <option value="urgent">فوری / استراتژیک</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                برآورد زمان و تلاش
              </label>
              <input
                type="text"
                value={estimatedEffort}
                onChange={(e) => setEstimatedEffort(e.target.value)}
                placeholder="مثال: ۲ هفته، ۱ ماه"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                برآورد بودجه / منابع
              </label>
              <input
                type="text"
                value={estimatedBudget}
                onChange={(e) => setEstimatedBudget(e.target.value)}
                placeholder="مثال: ۵۰ میلیون تومان، بدون هزینه مالی"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              برچسب‌ها (با کاما یا ویرگول جدا کنید)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="مثال: اتوماسیون, هوش مصنوعی, چابک"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Poll section toggle */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPoll}
                  onChange={(e) => setHasPoll(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-purple-600" />
                  افزودن نظرسنجی چند گزینه‌ای به این ایده
                </span>
              </label>
            </div>

            {hasPoll && (
              <div className="mt-3 p-4 rounded-xl bg-purple-50/60 border border-purple-200 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1">
                    پرسش نظرسنجی
                  </label>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-purple-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1">
                    گزینه‌های نظرسنجی
                  </label>
                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                          placeholder={`گزینه ${idx + 1}`}
                          className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-purple-200 bg-white"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePollOption(idx)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 5 && (
                      <button
                        type="button"
                        onClick={handleAddPollOption}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        افزودن گزینه جدید
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all flex items-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              <span>ثبت رسمی ایده</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
