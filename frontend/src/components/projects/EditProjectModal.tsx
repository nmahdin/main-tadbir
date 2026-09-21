import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Priority, ProjectStatus, Project } from '../../types';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { 
  X, 
  FolderKanban, 
  Trash2, 
  Save, 
  Calendar, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  Palette, 
  Tag, 
  ShieldCheck,
  Pipette
} from 'lucide-react';

export const EditProjectModal: React.FC = () => {
  const {
    isEditProjectOpen,
    setIsEditProjectOpen,
    projectToEdit,
    setProjectToEdit,
    updateProject,
    deleteProject,
    categories,
    users,
    currentUser,
    projects,
    setSelectedProjectId,
    setActiveView
  } = useApp();

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0] || 'تولید محتوا و رسانه');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [budget, setBudget] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (projectToEdit) {
      setName(projectToEdit.name || '');
      setKey(projectToEdit.key || '');
      setDescription(projectToEdit.description || '');
      setCategory(projectToEdit.category || categories[0] || 'تولید محتوا و رسانه');
      setProjectManagerId(projectToEdit.projectManagerId || currentUser.id);
      setSelectedMemberIds(projectToEdit.memberIds || [currentUser.id]);
      setPriority(projectToEdit.priority || 'medium');
      setStatus(projectToEdit.status || 'active');
      setStartDate(projectToEdit.startDate || '');
      setDeadline(projectToEdit.deadline || '');
      setBudget(projectToEdit.budget || '');
      setColor(projectToEdit.color || '#6366f1');
      setTagInput((projectToEdit.tags || []).join(', '));
      setShowDeleteConfirm(false);
    }
  }, [projectToEdit, currentUser.id, categories]);

  if (!isEditProjectOpen || !projectToEdit) return null;

  const toggleMember = (userId: string) => {
    if (selectedMemberIds.includes(userId)) {
      if (selectedMemberIds.length > 1) {
        setSelectedMemberIds(selectedMemberIds.filter(id => id !== userId));
      }
    } else {
      setSelectedMemberIds([...selectedMemberIds, userId]);
    }
  };

  const handleClose = () => {
    setIsEditProjectOpen(false);
    setProjectToEdit(null);
    setShowDeleteConfirm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    updateProject(projectToEdit.id, {
      name: name.trim(),
      key: key.trim().toUpperCase() || projectToEdit.key,
      description: description.trim(),
      category,
      projectManagerId,
      memberIds: selectedMemberIds,
      priority,
      status,
      startDate,
      deadline,
      budget: budget.trim(),
      color,
      tags: tags.length > 0 ? tags : projectToEdit.tags
    });

    handleClose();
  };

  const handleDelete = () => {
    deleteProject(projectToEdit.id);
    handleClose();
    setActiveView('projects');
  };

  const colorOptions = [
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-right" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50/30">
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-2xl text-white shadow-md transition-colors"
              style={{ backgroundColor: color }}
            >
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                ویرایش و پیکربندی پروژه
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تغییر جزئیات، سررسیدها، مدیر پروژه، وضعیت و اعضای تیم
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Delete Confirmation Alert if triggered */}
        {showDeleteConfirm ? (
          <div className="p-6 bg-rose-50 border-b border-rose-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rose-900">
                  آیا از حذف پروژه «{projectToEdit.name}» اطمینان دارید؟
                </h4>
                <p className="text-xs text-rose-700 leading-relaxed">
                  با حذف این پروژه، تمامی وظایف، تسک‌های مربوطه و لاگ‌های مرتبط پاک خواهند شد. این عملیات غیرقابل بازگشت است.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>بله، پروژه حذف شود</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4.5 max-h-[75vh] overflow-y-auto">
          {/* Row 1: Title & Key */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                عنوان پروژه <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: توسعه پلتفرم رسانه‌ای"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                کلید پروژه (Key) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="DOC"
                maxLength={8}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono uppercase text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all text-left font-bold"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              توضیحات و اهداف پروژه
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اهداف کلیدی، دامنه پروژه و جزئیات اجرایی..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden resize-none transition-all leading-relaxed"
            />
          </div>

          {/* Category & Status & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
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

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                وضعیت پروژه
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                <option value="planning">در مرحله برنامه‌ریزی</option>
                <option value="active">در حال اجرا (فعال)</option>
                <option value="on_hold">متوقف شده (معلق)</option>
                <option value="completed">تکمیل شده</option>
                <option value="cancelled">لغو شده</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                اولویت
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                <option value="urgent">🔴 بسیار فوری (Urgent)</option>
                <option value="high">🟠 بالا (High)</option>
                <option value="medium">🟡 متوسط (Medium)</option>
                <option value="low">🟢 پایین (Low)</option>
              </select>
            </div>
          </div>

          {/* Project Manager & Budget */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                مدیر و سرپرست پروژه (Lead)
              </label>
              <select
                value={projectManagerId}
                onChange={(e) => setProjectManagerId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.title})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                بودجه تخصیص یافته
              </label>
              <input
                type="text"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="مثال: ۱۵۰,۰۰۰,۰۰۰ تومان"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
              />
            </div>
          </div>

          {/* Start Date & Deadline (Shamsi) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

          {/* Team Members Multi-Select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>اعضای تیم پروژه ({selectedMemberIds.length} نفر انتخاب شده)</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl max-h-36 overflow-y-auto">
              {users.map(u => {
                const isSelected = selectedMemberIds.includes(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => toggleMember(u.id)}
                    className={`p-2 rounded-xl border text-right transition-all flex items-center gap-2 cursor-pointer ${
                      isSelected 
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-1 ring-indigo-200' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[10px] ${
                      isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && '✓'}
                    </div>
                    <span className="text-xs font-semibold truncate">{u.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color & Custom Color Picker */}
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
              {colorOptions.map(c => (
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

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-500" />
              <span>برچسب‌ها (با کاما جدا کنید)</span>
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="رسانه, تولید محتوا, مستند"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3.5 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف پروژه</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

