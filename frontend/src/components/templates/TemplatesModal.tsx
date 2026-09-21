import React, { useState } from 'react';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import { ProjectTemplate, Priority } from '../../types';
import { 
  X, 
  Layers, 
  Sparkles, 
  Plus, 
  Edit3, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  ArrowLeft, 
  Calendar, 
  User, 
  DollarSign, 
  Tag, 
  Play, 
  FolderKanban, 
  CheckSquare, 
  LayoutGrid
} from 'lucide-react';

export const TemplatesModal: React.FC = () => {
  const {
    isTemplatesModalOpen,
    setIsTemplatesModalOpen,
    templates,
    deleteTemplate,
    applyTemplate,
    setIsTemplateEditorOpen,
    setSelectedTemplateId,
    setSelectedProjectId,
    setActiveView,
    users,
    currentUser
  } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTemplate, setActiveTemplate] = useState<ProjectTemplate | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  
  // Customization fields when applying
  const [customProjectName, setCustomProjectName] = useState('');
  const [customProjectKey, setCustomProjectKey] = useState('');
  const [customManagerId, setCustomManagerId] = useState(currentUser.id);
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isTemplatesModalOpen) return null;

  const categories = [
    { id: 'all', label: 'همه الگوها' },
    { id: 'مهندسی نرم‌افزار', label: 'مهندسی نرم‌افزار' },
    { id: 'بازاریابی و رشد', label: 'بازاریابی و رشد' },
    { id: 'طراحی محصول', label: 'طراحی محصول' },
    { id: 'امنیت و انطباق', label: 'امنیت و انطباق' },
    { id: 'سفارشی', label: 'الگوهای من (سفارشی)' }
  ];

  const filteredTemplates = templates.filter(t => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'سفارشی') return !t.isBuiltIn;
    return t.category === selectedCategory;
  });

  const currentTpl = activeTemplate || filteredTemplates[0] || templates[0];

  const handleSelectTemplate = (tpl: ProjectTemplate) => {
    setActiveTemplate(tpl);
    setIsApplying(false);
    setCustomProjectName(tpl.name);
    setCustomProjectKey(tpl.name.substring(0, 4).toUpperCase().replace(/[^A-Za-z0-9]/g, ''));
  };

  const handleStartApply = (tpl: ProjectTemplate) => {
    setActiveTemplate(tpl);
    setCustomProjectName(tpl.name);
    setCustomProjectKey(tpl.name.substring(0, 4).toUpperCase().replace(/[^A-Za-z0-9]/g, '') || 'PROJ');
    setCustomManagerId(currentUser.id);
    setCustomStartDate(new Date().toISOString().split('T')[0]);
    setIsApplying(true);
  };

  const handleConfirmApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTpl) return;

    const newProject = applyTemplate(currentTpl.id, {
      projectName: customProjectName.trim() || currentTpl.name,
      projectKey: customProjectKey.trim() || 'PROJ',
      projectManagerId: customManagerId,
      startDate: customStartDate
    });

    setIsApplying(false);
    setIsTemplatesModalOpen(false);
    setSelectedProjectId(newProject.id);
    setActiveView('project-detail');
  };

  const handleEdit = (tpl: ProjectTemplate) => {
    setSelectedTemplateId(tpl.id);
    setIsTemplatesModalOpen(false);
    setIsTemplateEditorOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedTemplateId(null);
    setIsTemplatesModalOpen(false);
    setIsTemplateEditorOpen(true);
  };

  const priorityLabels: Record<Priority, { label: string; class: string }> = {
    urgent: { label: 'فوری', class: 'bg-rose-100 text-rose-700 border-rose-200' },
    high: { label: 'بالا', class: 'bg-amber-100 text-amber-700 border-amber-200' },
    medium: { label: 'متوسط', class: 'bg-blue-100 text-blue-700 border-blue-200' },
    low: { label: 'پایین', class: 'bg-slate-100 text-slate-700 border-slate-200' }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] max-h-[850px]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">الگوهای آماده و سفارشی پروژه</h3>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-semibold">
                  {templates.length} الگو
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                با انتخاب الگوهای از پیش تنظیم‌شده، پروژه‌های خود را همراه با مراحل، چک‌لیست‌ها و زمان‌بندی در چند ثانیه راه‌اندازی کنید.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-create-new-template"
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ساخت الگوی جدید</span>
            </button>
            <button
              onClick={() => setIsTemplatesModalOpen(false)}
              className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Modal Main Body: 2 Columns (List & Preview/Apply) */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Left Column: Template Cards List */}
          <div className="md:col-span-5 border-l border-slate-200 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12 px-4">
                <LayoutGrid className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">هیچ الگویی در این دسته یافت نشد</p>
                <p className="text-xs text-slate-600 mt-1">می‌توانید اولین الگوی سفارشی خود را ایجاد کنید.</p>
                <button
                  onClick={handleCreateNew}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                >
                  ایجاد الگوی اختصاصی
                </button>
              </div>
            ) : (
              filteredTemplates.map(tpl => {
                const isSelected = currentTpl?.id === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer text-right ${
                      isSelected
                        ? 'bg-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs"
                          style={{ backgroundColor: tpl.color }}
                        >
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 leading-tight">{tpl.name}</h4>
                          <span className="text-[11px] text-slate-600">{tpl.category}</span>
                        </div>
                      </div>

                      {tpl.isBuiltIn ? (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-semibold border border-slate-200">
                          سیستمی
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-semibold border border-indigo-200">
                          سفارشی
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mt-2.5 line-clamp-2 leading-relaxed">
                      {tpl.description}
                    </p>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-600" />
                        {tpl.estimatedDurationDays} روز
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <CheckSquare className="w-3.5 h-3.5 text-slate-600" />
                        {tpl.tasks.length} تسک
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <FolderKanban className="w-3.5 h-3.5 text-slate-600" />
                        {tpl.stages.length} مرحله
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Detailed Preview & Apply Form */}
          <div className="md:col-span-7 p-6 overflow-y-auto bg-white flex flex-col justify-between">
            {currentTpl ? (
              !isApplying ? (
                // View Template Details
                <div className="space-y-6">
                  {/* Title & Actions Bar */}
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-start gap-3.5">
                      <div 
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-md shrink-0"
                        style={{ backgroundColor: currentTpl.color }}
                      >
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-slate-900">{currentTpl.name}</h2>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${priorityLabels[currentTpl.defaultPriority].class}`}>
                            اولویت {priorityLabels[currentTpl.defaultPriority].label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{currentTpl.category} • زمان تقریبی: {currentTpl.estimatedDurationDays} روز کاری</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleEdit(currentTpl)}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                        title="ویرایش الگو"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {!currentTpl.isBuiltIn && (
                        <button
                          onClick={() => {
                            if (window.confirm('آیا از حذف این الگوی سفارشی اطمینان دارید؟')) {
                              deleteTemplate(currentTpl.id);
                              setActiveTemplate(null);
                            }
                          }}
                          className="p-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="حذف الگو"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">شرح و اهداف الگو</h5>
                    <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      {currentTpl.description}
                    </p>
                  </div>

                  {/* Predefined Stages */}
                  <div>
                    <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      مراحل کاری پیش‌فرض ({currentTpl.stages.length} مرحله)
                    </h5>
                    <div className="flex items-center gap-2 flex-wrap">
                      {currentTpl.stages.map((stage, idx) => (
                        <div 
                          key={stage.id} 
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-slate-50 text-xs font-semibold text-slate-800"
                        >
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                          <span>{idx + 1}. {stage.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Predefined Tasks Breakdown */}
                  <div>
                    <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      وظایف و تسک‌های از پیش تعریف‌شده ({currentTpl.tasks.length} تسک)
                    </h5>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {currentTpl.tasks.map((task, idx) => (
                        <div 
                          key={task.id} 
                          className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 text-right space-y-1.5 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-800 text-[11px] font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-900">{task.title}</span>
                            </div>
                            <span className="text-[11px] text-slate-600 font-medium">
                              روز {task.relativeDueDays} • {task.estimatedHours} ساعت
                            </span>
                          </div>

                          {task.description && (
                            <p className="text-[11px] text-slate-600 pr-7">{task.description}</p>
                          )}

                          {task.subtasks && task.subtasks.length > 0 && (
                            <div className="pr-7 pt-1 flex items-center gap-2 flex-wrap">
                              {task.subtasks.map((sub, sIdx) => (
                                <span key={sIdx} className="text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                                  ✓ {sub}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button
                      id="btn-apply-template-start"
                      onClick={() => handleStartApply(currentTpl)}
                      className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-200 transition-all cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>اعمال این الگو و ایجاد پروژه</span>
                    </button>
                  </div>
                </div>
              ) : (
                // Apply & Customize Screen
                <form onSubmit={handleConfirmApply} className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">سفارشی‌سازی و ایجاد پروژه از الگو</h3>
                      <p className="text-xs text-slate-600 mt-0.5">الگوی انتخاب‌شده: {currentTpl.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsApplying(false)}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>بازگشت به پیش‌نمایش</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        نام پروژه جدید *
                      </label>
                      <input
                        required
                        type="text"
                        value={customProjectName}
                        onChange={(e) => setCustomProjectName(e.target.value)}
                        placeholder="عنوان پروژه..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        شناسه پروژه (Key) *
                      </label>
                      <input
                        required
                        type="text"
                        maxLength={5}
                        value={customProjectKey}
                        onChange={(e) => setCustomProjectKey(e.target.value.toUpperCase())}
                        placeholder="KEY"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 uppercase focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        مدیر پروژه
                      </label>
                      <select
                        value={customManagerId}
                        onChange={(e) => setCustomManagerId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                      >
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        تاریخ آغاز پروژه
                      </label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-xs text-indigo-950 space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>عملیات خودکار ایجاد پروژه:</span>
                    </div>
                    <ul className="space-y-1 text-xs text-indigo-800 pr-5 list-disc">
                      <li>تولید خودکار <b>{currentTpl.tasks.length} تسک</b> با محاسبه تاریخ‌های سررسید متناسب با تاریخ آغاز</li>
                      <li>راه‌اندازی <b>{currentTpl.stages.length} ستون</b> کانبان اختصاصی طبق استاندارد الگو</li>
                      <li>ثبت لاگ فعالیت زنده در فید داشبورد و ارجاع وظایف به اعضای تیم</li>
                    </ul>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsApplying(false)}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      id="btn-confirm-apply-template"
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                    >
                      ایجاد پروژه و بارگذاری تسک‌ها
                    </button>
                  </div>
                </form>
              )
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                یک الگو را از لیست سمت راست انتخاب کنید
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
