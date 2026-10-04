import { useCreateProject, useUpdateProject } from '../../queries/resources';
import { Modal, Button, ErrorState } from '../common/Primitives';
import { parseApiError } from '../../api/errors';
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Priority, ProjectStatus } from '../../types';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { Layers, Palette, Pipette } from 'lucide-react';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';

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
    waitForProject,
    notify,
    templates,
    applyTemplate,
    categories,
    setSelectedProjectId,
    setActiveView,
    setIsTemplatesModalOpen
  } = useApp();

  const createProject = useCreateProject();
  const editProject = useUpdateProject();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const isOpen = isCreateProjectOpen || isEditProjectOpen;
  const isEditing = isEditProjectOpen && !!projectToEdit;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('none');
  const [name, setName] = useState('');
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
  const [budget, setBudget] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [tagInput, setTagInput] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);

  useEffect(() => {
    if (isEditing && projectToEdit) {
      setName(projectToEdit.name);
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
      setBudget('');
      setColor('#6366f1');
      setTagInput('');
      setSelectedTemplateId('none');
    }
  }, [isEditing, projectToEdit, isCreateProjectOpen, categories, currentUser.id]);

  useEffect(() => {
    if (isOpen) setAttachmentDraft(createEmptyAttachmentDraft());
  }, [isOpen, projectToEdit?.id]);

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

  const toggleMember = (userId: string) => {
    if (selectedMemberIds.includes(userId)) {
      setSelectedMemberIds(selectedMemberIds.filter(id => id !== userId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, userId]);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setIsCreateProjectOpen(false);
    setIsEditProjectOpen(false);
  };

  const persistProjectAttachments = async (projectId: string) => {
    const count = attachmentDraftCount(attachmentDraft);
    if (count === 0) return;
    if (/^\d+$/.test(projectId)) {
      await persistAttachmentDraft(attachmentDraft, { projectId }, name.trim());
    }
    notify({ type: 'success', title: 'ضمیمه‌ها متصل شدند', message: `${count.toLocaleString('fa-IR')} ضمیمه برای پروژه ثبت شد.` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitError(''); setFieldErrors({}); setSubmitting(true);
    try {

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const finalCategory = isCustomCategory && customCategory.trim() ? customCategory.trim() : category;

    if (isEditing && projectToEdit) {
      await editProject.mutateAsync({ id: projectToEdit.id, data: {
        name: name.trim(),
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
      } });
      await persistProjectAttachments(projectToEdit.id);
      setIsCreateProjectOpen(false); setIsEditProjectOpen(false);
      notify({ type: 'success', title: 'پروژه با موفقیت به‌روزرسانی شد.' });
      return;
    }

    // If template selected, use applyTemplate
    if (selectedTemplateId && selectedTemplateId !== 'none') {
      const newProj = await applyTemplate(selectedTemplateId, {
        projectName: name.trim(),
        description: description.trim(),
        projectManagerId,
        memberIds: selectedMemberIds.length > 0 ? selectedMemberIds : [currentUser.id],
        startDate,
        deadline,
        color
      });
      if (newProj) {
        const saved = newProj;
        if (!saved) throw new Error('پروژه در سرور ثبت نشد.');
        await persistProjectAttachments(saved.id);
        setIsCreateProjectOpen(false); setIsEditProjectOpen(false);
        setSelectedProjectId(saved.id);
        setActiveView('project-detail');
        return;
      }
    }

    // Otherwise create regular blank project
    const response = await createProject.mutateAsync({
      name: name.trim(),
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

    await persistProjectAttachments(response.data.id);
    notify({ type: 'success', title: 'پروژه با موفقیت ایجاد شد.' });
    setIsCreateProjectOpen(false); setIsEditProjectOpen(false);
    setSelectedProjectId(response.data.id);
    setActiveView('project-detail');
    } catch (error) { const parsed = parseApiError(error); setFieldErrors(parsed.fields); setSubmitError(Object.values(parsed.fields).flat().join(' • ') || parsed.message); }
    finally { setSubmitting(false); }
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
    <Modal open={isOpen} onClose={handleClose} title={isEditing ? 'ویرایش پروژه' : 'ایجاد پروژه جدید'} busy={submitting} size="xl" panelScroll={false}>
        <form onSubmit={handleSubmit} className="flex h-[calc(94dvh-66px)] max-h-[760px] min-h-0 flex-col overflow-hidden">
          <div className="flex-1 space-y-4.5 overflow-y-auto p-6">
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

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">نام پروژه *</label>
            <input
              required
              autoFocus
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: تولید مستند تحلیلی ویژه نوروز"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              aria-invalid={!!fieldErrors.name}
              aria-describedby="name-error"
            />
            {fieldErrors.name && <p id="name-error" role="alert" className="text-xs text-rose-700 mt-1">{fieldErrors.name.join(' • ')}</p>}
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

          <AttachmentComposer value={attachmentDraft} onChange={setAttachmentDraft} disabled={submitting} title="ضمیمه‌های پروژه" defaultFolderLabel={`پروژه‌ها / ${name.trim() || 'نام پروژه'} / فایل`} />

          {submitError && <ErrorState title={submitError} />}
          </div>
          {/* Footer Submit */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleClose()}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              انصراف
            </button>
            <Button loading={submitting}
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
            >
              {isEditing ? 'ذخیره تغییرات پروژه' : (selectedTemplateId !== 'none' ? 'ایجاد پروژه با الگو و تسک‌ها' : 'ایجاد پروژه جدید')}
            </Button>
          </div>
        </form>
    </Modal>
  );
};

