import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ProjectTemplate, TemplateTask, Priority, TaskStatus } from '../../types';
import { X, Plus, Trash2, Layers, Check, Sparkles, Palette, Pipette } from 'lucide-react';

export const TemplateEditorModal: React.FC = () => {
  const {
    isTemplateEditorOpen,
    setIsTemplateEditorOpen,
    selectedTemplateId,
    templates,
    categories,
    addTemplate,
    updateTemplate,
    setIsTemplatesModalOpen
  } = useApp();

  const editingTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0] || 'تولید محتوا و رسانه');
  const [color, setColor] = useState('#6366f1');
  const [defaultPriority, setDefaultPriority] = useState<Priority>('high');
  const [estimatedDurationDays, setEstimatedDurationDays] = useState(14);
  const [budget, setBudget] = useState('۱۰۰,۰۰۰,۰۰۰ تومان');
  const [tagInput, setTagInput] = useState('اسپرینت, چابک');

  // Stages State
  const [stages, setStages] = useState<{ id: TaskStatus; name: string; color: string }[]>([
    { id: 'backlog', name: 'بک‌لاگ', color: '#94a3b8' },
    { id: 'todo', name: 'برای انجام', color: '#64748b' },
    { id: 'in_progress', name: 'در حال انجام', color: '#3b82f6' },
    { id: 'review', name: 'در حال بازبینی', color: '#8b5cf6' },
    { id: 'completed', name: 'تکمیل شده', color: '#10b981' }
  ]);

  // Tasks State
  const [tasks, setTasks] = useState<TemplateTask[]>([
    {
      id: 'tt-sample-1',
      title: 'برنامه‌ریزی اولیه و مشخص کردن نیازمندی‌ها',
      description: 'تعریف استوری‌های کاربر و تخصیص اهداف اصلی فاز',
      relativeDueDays: 3,
      estimatedHours: 8,
      priority: 'high',
      status: 'todo',
      tags: ['برنامه‌ریزی'],
      subtasks: ['تعریف اهداف فاز', 'تعیین معیارهای موفقیت']
    }
  ]);

  // Task creation form inside modal
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDueDays, setNewTaskDueDays] = useState(5);
  const [newTaskHours, setNewTaskHours] = useState(8);
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState('');

  useEffect(() => {
    if (editingTemplate) {
      setName(editingTemplate.name);
      setDescription(editingTemplate.description);
      setCategory(editingTemplate.category || categories[0] || 'تولید محتوا و رسانه');
      setColor(editingTemplate.color || '#6366f1');
      setDefaultPriority(editingTemplate.defaultPriority || 'high');
      setEstimatedDurationDays(editingTemplate.estimatedDurationDays || 14);
      setBudget(editingTemplate.budget || '۱۰۰,۰۰۰,۰۰۰ تومان');
      setTagInput((editingTemplate.tags || []).join(', '));
      setStages(editingTemplate.stages || stages);
      setTasks(editingTemplate.tasks || []);
    } else {
      setName('');
      setDescription('');
      setCategory(categories[0] || 'تولید محتوا و رسانه');
      setColor('#6366f1');
      setDefaultPriority('high');
      setEstimatedDurationDays(14);
      setBudget('۱۰۰,۰۰۰,۰۰۰ تومان');
      setTagInput('رسانه, تولید محتوا');
    }
  }, [editingTemplate, isTemplateEditorOpen, categories]);

  if (!isTemplateEditorOpen) return null;

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;

    const subtasks = newTaskSubtasks
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const task: TemplateTask = {
      id: `tt-${Date.now()}`,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      relativeDueDays: Number(newTaskDueDays) || 5,
      estimatedHours: Number(newTaskHours) || 8,
      priority: newTaskPriority,
      status: 'todo',
      tags: [category],
      subtasks
    };

    setTasks([...tasks, task]);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskSubtasks('');
  };

  const handleRemoveTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (editingTemplate) {
      updateTemplate(editingTemplate.id, {
        name: name.trim(),
        description: description.trim(),
        category,
        color,
        defaultPriority,
        estimatedDurationDays: Number(estimatedDurationDays) || 14,
        budget,
        stages,
        tasks,
        tags: tags.length > 0 ? tags : ['الگو']
      });
    } else {
      addTemplate({
        name: name.trim(),
        description: description.trim(),
        category,
        icon: 'Layers',
        color,
        defaultPriority,
        estimatedDurationDays: Number(estimatedDurationDays) || 14,
        budget,
        stages,
        tasks,
        tags: tags.length > 0 ? tags : ['الگو']
      });
    }

    setIsTemplateEditorOpen(false);
    setIsTemplatesModalOpen(true);
  };

  const colorPalette = [
    '#6366f1',
    '#3b82f6',
    '#0ea5e9',
    '#10b981',
    '#14b8a6',
    '#f59e0b',
    '#f97316',
    '#ef4444',
    '#ec4899',
    '#8b5cf6',
    '#64748b'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150" dir="rtl">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] max-h-[850px]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md transition-colors"
              style={{ backgroundColor: color }}
            >
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {editingTemplate ? `ویرایش الگوی: ${editingTemplate.name}` : 'تعریف الگوی جدید پروژه'}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                مراحل، تسک‌های پیش‌فرض و چک‌لیست‌های اختصاصی سازمان خود را تنظیم کنید.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setIsTemplateEditorOpen(false);
              setIsTemplatesModalOpen(true);
            }}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-right">
          {/* General Information */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">مشخصات عمومی الگو</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  نام الگو *
                </label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: تولید مستند تحلیلی، پویش رسانه‌ای، پوشش رویداد زنده..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  دسته‌بندی
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                توضیحات و اهداف الگو
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="توضیح دهید این الگو برای چه پروژه‌هایی مناسب است و چه مراحلی را شامل می‌شود..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  مدت زمان تقریبی (روز)
                </label>
                <input
                  type="number"
                  min={1}
                  value={estimatedDurationDays}
                  onChange={(e) => setEstimatedDurationDays(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  اولویت پیش‌فرض
                </label>
                <select
                  value={defaultPriority}
                  onChange={(e) => setDefaultPriority(e.target.value as Priority)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                >
                  <option value="urgent">🔴 فوری</option>
                  <option value="high">🟠 بالا</option>
                  <option value="medium">🟡 متوسط</option>
                  <option value="low">🟢 پایین</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  برآورد بودجه
                </label>
                <input
                  type="text"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="مثال: ۱۰۰,۰۰۰,۰۰۰ تومان"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            {/* Color & Custom Color Picker */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-indigo-600" />
                  <span>رنگ‌بندی و هویت بصری الگو</span>
                </label>
                <span className="text-[11px] font-mono font-bold text-slate-600 uppercase px-2 py-0.5 bg-white rounded-md border border-slate-200">
                  {color}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {colorPalette.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer shadow-2xs ${
                      color.toLowerCase() === c.toLowerCase() ? 'border-slate-900 scale-120 ring-2 ring-indigo-400 ring-offset-1' : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}

                {/* Custom Color Native Picker Input */}
                <div className="flex items-center gap-1.5 pr-2 border-r border-slate-300 mr-1">
                  <label className="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-slate-400 hover:border-indigo-600 bg-white cursor-pointer group shadow-2xs">
                    <Pipette className="w-4 h-4 text-slate-600 group-hover:text-indigo-600" />
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      title="انتخاب رنگ سفارشی دلخواه"
                    />
                  </label>
                  <div className="flex items-center">
                    <span className="text-xs text-slate-400 font-mono pr-1">#</span>
                    <input
                      type="text"
                      maxLength={7}
                      value={color.replace('#', '')}
                      onChange={(e) => {
                        const val = '#' + e.target.value.replace(/[^0-9A-Fa-f]/g, '');
                        setColor(val);
                      }}
                      placeholder="6366f1"
                      className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 text-left uppercase focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Predefined Tasks Section */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                تسک‌های از پیش تعریف‌شده الگو ({tasks.length} تسک)
              </h4>
              <span className="text-xs text-slate-600">
                هنگام ایجاد پروژه از این الگو، تمام این تسک‌ها به طور خودکار ساخته می‌شوند.
              </span>
            </div>

            {/* List of Defined Tasks */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {tasks.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-600">
                  هنوز تسکی به این الگو افزوده نشده است. از فرم زیر برای افزودن تسک استفاده کنید.
                </div>
              ) : (
                tasks.map((t, idx) => (
                  <div 
                    key={t.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-800 text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{t.title}</span>
                        <span className="text-[10px] bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                          روز {t.relativeDueDays} • {t.estimatedHours} ساعت
                        </span>
                      </div>
                      {t.description && <p className="text-[11px] text-slate-600 pr-7">{t.description}</p>}
                      {t.subtasks && t.subtasks.length > 0 && (
                        <div className="pr-7 pt-1 flex items-center gap-1.5 flex-wrap">
                          {t.subtasks.map((sub, sIdx) => (
                            <span key={sIdx} className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded-sm border border-slate-200">
                              ✓ {sub}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveTask(t.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick Add Task Box */}
            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3">
              <h5 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>افزودن تسک پیش‌فرض جدید به الگو</span>
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="عنوان تسک (مثال: ضبط نریشن و صداگذاری)..."
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    min={1}
                    value={newTaskDueDays}
                    onChange={(e) => setNewTaskDueDays(Number(e.target.value))}
                    placeholder="مهلت (چند روز پس از شروع)"
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden"
                  >
                    <option value="urgent">فوری</option>
                    <option value="high">بالا</option>
                    <option value="medium">متوسط</option>
                    <option value="low">پایین</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <textarea
                  rows={2}
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  placeholder="شرح و دستورالعمل اجرایی تسک..."
                  className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 focus:outline-hidden resize-none"
                />
                <textarea
                  rows={2}
                  value={newTaskSubtasks}
                  onChange={(e) => setNewTaskSubtasks(e.target.value)}
                  placeholder="چک‌لیست زیرتسک‌ها (هر مورد در یک سطر جدید)..."
                  className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 focus:outline-hidden resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت تسک در الگو</span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsTemplateEditorOpen(false);
                setIsTemplatesModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
            >
              {editingTemplate ? 'ذخیره تغییرات الگو' : 'ایجاد و ذخیره الگو'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
