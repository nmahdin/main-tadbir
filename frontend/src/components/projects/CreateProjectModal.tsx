import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Priority, ProjectStatus } from '../../types';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { X, FolderKanban, Layers, Sparkles, Palette, Pipette } from 'lucide-react';

export const CreateProjectModal: React.FC = () => {
  const {
    isCreateProjectOpen,
    setIsCreateProjectOpen,
    isEditProjectOpen,
    setIsEditProjectOpen,
    projectToEdit,
    updateProject,
    users,
    currentUser,
    addProject,
    templates,
    applyTemplate,
    categories,
    setSelectedProjectId,
    setActiveView,
    setIsTemplatesModalOpen
  } = useApp();

  const isOpen = isCreateProjectOpen || isEditProjectOpen;
  const isEditing = isEditProjectOpen && !!projectToEdit;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('none');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0] || 'تولید محتوا و رسانه');
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [projectManagerId, setProjectManagerId] = useState(currentUser.id);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([currentUser.id]);
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0]
  );
  const [budget, setBudget] = useState('۱۲۰,۰۰۰,۰۰۰ تومان');
  const [color, setColor] = useState('#6366f1');
  const [tagInput, setTagInput] = useState('رسانه, تولید محتوا');

  useEffect(() => {
    if (isEditing && projectToEdit) {
      setName(projectToEdit.name);
      setKey(projectToEdit.key);
      setDescription(projectToEdit.description || '');
      
      if (categories.includes(projectToEdit.category)) {
        setCategory(projectToEdit.category);
        setIsCustomCategory(false);
      } else {
        setCategory('custom');
        setCustomCategory(projectToEdit.category);
        setIsCustomCategory(true);
      }
      
      setProjectManagerId(projectToEdit.projectManagerId);
      setSelectedMemberIds(projectToEdit.memberIds || []);
      setPriority(projectToEdit.priority || 'medium');
      setStatus(projectToEdit.status || 'active');
      setStartDate(projectToEdit.startDate);
      setDeadline(projectToEdit.deadline);
      setBudget(projectToEdit.budget || '');
      setColor(projectToEdit.color || '#6366f1');
      setTagInput(projectToEdit.tags?.join(', ') || '');
    } else if (isCreateProjectOpen) {
      setName('');
      setKey('');
      setDescription('');
      setCategory(categories[0] || 'تولید محتوا و رسانه');
      setIsCustomCategory(false);
      setCustomCategory('');
      setProjectManagerId(currentUser.id);
      setSelectedMemberIds([currentUser.id]);
      setPriority('medium');
      setStatus('active');
      setStartDate(new Date().toISOString().split('T')[0]);
      setDeadline(new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0]);
      setBudget('۱۲۰,۰۰۰,۰۰۰ تومان');
      setColor('#6366f1');
      setTagInput('رسانه, تولید محتوا');
      setSelectedTemplateId('none');
    }
  }, [isEditing, projectToEdit, isCreateProjectOpen, categories, currentUser.id]);

  if (!isOpen) return null;

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId !== 'none') {
      const tmpl = templates.find(t => t.id === templateId);
      if (tmpl) {
        setName(`پروژه ${tmpl.name}`);
        setDescription(tmpl.description);
        setCategory(tmpl.category);
        setColor(tmpl.color);
        setPriority(tmpl.defaultPriority);
        if (tmpl.budget) setBudget(tmpl.budget);
        if (tmpl.tags) setTagInput(tmpl.tags.join(', '));
        const dueDays = tmpl.estimatedDurationDays || 30;
        setDeadline(new Date(Date.now() + dueDays * 86400000).toISOString().split('T')[0]);
      }
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!key || key.length < 5) {
      const generated = val.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
      if (generated) setKey(generated);
    }
  };

  const toggleMember = (userId: string) => {
    if (selectedMemberIds.includes(userId)) {
      setSelectedMemberIds(selectedMemberIds.filter(id => id !== userId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, userId]);
    }
  };

  const handleClose = () => {
    handleClose();
    setIsEditProjectOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const finalCategory = isCustomCategory && customCategory.trim() ? customCategory.trim() : category;

    if (isEditing && projectToEdit) {
      updateProject(projectToEdit.id, {
        name: name.trim(),
        key: key.trim(),
        description: description.trim(),
        category: finalCategory,
        projectManagerId,
        memberIds: selectedMemberIds,
        priority,
        status,
        startDate,
        deadline,
        budget,
        color,
        tags: tags.length > 0 ? tags : ['پروژه']
      });
      handleClose();
      return;
    }

    // If template selected, use applyTemplate
    if (selectedTemplateId && selectedTemplateId !== 'none') {
      const newProj = applyTemplate(selectedTemplateId, {
        projectName: name.trim(),
        projectKey: key.trim() || 'PROJ',
        description: description.trim(),
        projectManagerId,
        memberIds: selectedMemberIds.length > 0 ? selectedMemberIds : [currentUser.id],
        startDate,
        deadline,
        color
      });
      if (newProj) {
        handleClose();
        setSelectedProjectId(newProj.id);
        setActiveView('project-detail');
        return;
      }
    }

    // Otherwise create regular blank project
    const newProj = addProject({
      name: name.trim(),
      key: key.trim() || 'PROJ',
      description: description.trim(),
      category: finalCategory,
      projectManagerId,
      memberIds: selectedMemberIds.length > 0 ? selectedMemberIds : [currentUser.id],
      priority,
      status,
      startDate,
      deadline,
      budget,
      color,
      tags: tags.length > 0 ? tags : ['پروژه']
    });

    handleClose();
    setSelectedProjectId(newProj.id);
    setActiveView('project-detail');
  };

  const colorPalette = [
    '#6366f1', // Indigo
    '#3b82f6', // Blue
    '#0ea5e9', // Sky
    '#10b981', // Emerald
    '#14b8a6', // Teal
    '#f59e0b', // Amber
    '#f97316', // Orange
    '#ef4444', // Red
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#64748b', // Slate
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 text-right" dir="rtl">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-xs shadow-md transition-colors"
              style={{ backgroundColor: color }}
            >
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isEditing ? 'ویرایش و تنظیمات پروژه' : 'تعریف و راه‌اندازی پروژه جدید'}
              </h3>
              <p className="text-xs text-slate-600">تعیین ساختار، اعضای تحریریه/تولید، زمان‌بندی و رنگ‌بندی سازمانی</p>
            </div>
          </div>
          <button
            onClick={() => handleClose()}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4.5 flex-1">
          {/* Template Selection Box */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>شروع از الگوی آماده پروژه (اختیاری)</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  setIsTemplatesModalOpen(true);
                }}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
              >
                مشاهده و ویرایش همه الگوها
              </button>
            </div>

            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 focus:outline-hidden"
            >
              <option value="none">پروژه خام (بدون الگو و تسک پیش‌فرض)</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.tasks.length} وظیفه آماده در {t.category})
                </option>
              ))}
            </select>
            {selectedTemplateId !== 'none' && (
              <p className="text-[11px] text-indigo-700">
                ✨ با انتخاب این الگو، تمام مراحل و تسک‌های مربوطه به صورت خودکار ایجاد و زمان‌بندی خواهند شد.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                نام پروژه *
              </label>
              <input
                required
                autoFocus
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="مثال: تولید مستند تحلیلی ویژه نوروز"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                کلید پروژه (Key)
              </label>
              <input
                type="text"
                maxLength={6}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="DOC"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden uppercase text-left"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              توضیحات و اهداف پروژه
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="خلاصه‌ای از اهداف، ددلاین‌ها، خروجی‌های رسانه‌ای و تحویل‌دادنی‌های کلیدی پروژه..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                مدیر مسئول پروژه
              </label>
              <select
                value={projectManagerId}
                onChange={(e) => setProjectManagerId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                اولویت پروژه
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                <option value="urgent">🔴 فوری و حیاتی</option>
                <option value="high">🟠 بالا</option>
                <option value="medium">🟡 متوسط</option>
                <option value="low">🟢 عادی / پایین</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                دسته‌بندی موضوعی
              </label>
              {!isCustomCategory ? (
                <div className="space-y-1">
                  <select
                    value={category}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomCategory(true);
                      } else {
                        setCategory(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__custom__">➕ دسته‌بندی سفارشی جدید...</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="نام دسته‌بندی جدید..."
                    className="flex-1 px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs text-slate-800 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomCategory(false)}
                    className="p-2 text-slate-400 hover:text-slate-700 text-xs"
                    title="بازگشت به لیست"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Shamsi Date Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PersianDatePicker
              label="تاریخ آغاز پروژه (شمسی)"
              value={startDate}
              onChange={(d) => setStartDate(d)}
            />
            <PersianDatePicker
              label="مهلت و سررسید پروژه (شمسی)"
              value={deadline}
              onChange={(d) => setDeadline(d)}
            />
          </div>

          {/* Color theme selection & Custom Color Picker */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-indigo-600" />
                <span>رنگ‌بندی و هویت بصری پروژه</span>
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

          {/* Team Members Assignment */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              اعضای همکار در این پروژه ({selectedMemberIds.length} نفر)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {users.map(u => {
                const isSelected = selectedMemberIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMember(u.id)}
                    className={`flex items-center gap-2 p-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer text-right ${
                      isSelected ? 'bg-indigo-100/70 text-indigo-900 font-bold' : 'hover:bg-white text-slate-700'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                      isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && '✓'}
                    </span>
                    <span className="truncate">{u.name} ({u.title})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => handleClose()}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
            >
              {isEditing ? 'ذخیره تغییرات پروژه' : (selectedTemplateId !== 'none' ? 'ایجاد پروژه با الگو و تسک‌ها' : 'ایجاد پروژه جدید')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

