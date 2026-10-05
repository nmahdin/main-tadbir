import React, { useMemo, useRef, useState, useEffect } from 'react';
import { X, Lightbulb, Plus, Trash2, BarChart2 } from 'lucide-react';
import { Priority, Idea } from '../../types';
import { useApp } from '../../context/AppContext';
import { AttachmentComposer, PersistedAttachment, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';
import { request } from '../../api/client';

interface CreateIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  ideaToEdit?: Idea | null;
  projectId?: string;
}

export const CreateIdeaModal: React.FC<CreateIdeaModalProps> = ({ isOpen, onClose, ideaToEdit, projectId: initialProjectId }) => {
  const { addIdea, updateIdea, addIdeaCategory, currentUser, departments, projects, ideaCategories } = useApp();
  const isEditing = !!ideaToEdit;
  const createRequestId = useRef(crypto.randomUUID());
  const persistedAttachments = useRef<Idea['attachments'] | null>(null);
  const persistedAssetIds = useRef<number[]>([]);

  const [flowStages, setFlowStages] = useState<string[]>(['بررسی اولیه', 'ارزیابی و رأی‌گیری', 'تصمیم نهایی']);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [estimatedEffort, setEstimatedEffort] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [departmentId, setDepartmentId] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);
  const availableDepartments = useMemo(() => {
    const unique = new Map<string, (typeof departments)[number]>();
    departments.forEach(department => {
      if (department.status === 'active' || department.id === ideaToEdit?.departmentId) unique.set(department.id, department);
    });
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name, 'fa'));
  }, [departments, ideaToEdit?.departmentId]);
  
  // Poll settings
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  useEffect(() => {
    if (!isOpen) return;
    if (ideaToEdit) {
      setTitle(ideaToEdit.title || '');
      setFlowStages(ideaToEdit.flowStages?.map(stage => stage.title) || ['بررسی اولیه', 'ارزیابی و رأی‌گیری', 'تصمیم نهایی']);
      setDescription(ideaToEdit.description || '');
      setEstimatedEffort(ideaToEdit.estimatedEffort || '');
      setEstimatedBudget(ideaToEdit.estimatedBudget || '');
      setPriority(ideaToEdit.priority || 'medium');
      setDepartmentId(ideaToEdit.departmentId || '');
      setCategory(ideaToEdit.category || '');
      setProjectId(ideaToEdit.projectId || '');
      setTagsInput((ideaToEdit.tags || []).join('، '));
      setHasPoll(ideaToEdit.hasPoll || false);
      setPollQuestion(ideaToEdit.pollQuestion || '');
      setPollOptions((ideaToEdit.pollOptions || []).map(o => o.text));
    } else {
      setTitle('');
      setFlowStages(['بررسی اولیه', 'ارزیابی و رأی‌گیری', 'تصمیم نهایی']);
      setDescription('');
      setEstimatedEffort('');
      setEstimatedBudget('');
      setPriority('medium');
      setDepartmentId('');
      setCategory('');
      setProjectId(initialProjectId || '');
      setTagsInput('');
      setHasPoll(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    }
    setNewCategory('');
    setIsAddingCategory(false);
    setAttachmentDraft(createEmptyAttachmentDraft());
    persistedAttachments.current = null;
    persistedAssetIds.current = [];
    if (!ideaToEdit) createRequestId.current = crypto.randomUUID();
    setSubmitError('');
  }, [isOpen, ideaToEdit, initialProjectId]);

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

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value || isAddingCategory) return;
    setIsAddingCategory(true);
    setSubmitError('');
    try {
      const saved = await addIdeaCategory(value);
      setCategory(saved);
      setNewCategory('');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'ایجاد دسته‌بندی ایده انجام نشد.');
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || isSubmitting) return;
    if (hasPoll && (!pollQuestion.trim() || pollOptions.filter(option => option.trim()).length < 2)) {
      setSubmitError('برای نظرسنجی، پرسش و حداقل دو گزینه را وارد کنید.');
      return;
    }

    const tags = tagsInput
      .split(/[,،]+/)
      .map(t => t.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    setSubmitError('');
    try {
      let newAttachments = persistedAttachments.current || [];
      if (attachmentDraftCount(attachmentDraft) > 0 && persistedAttachments.current === null) {
        const references = await persistAttachmentDraft(attachmentDraft, {
          ideaId: ideaToEdit?.id,
          ideaTitle: title.trim(),
          ideaKey: createRequestId.current,
        }, title.trim());
        persistedAssetIds.current = references.filter(reference => reference.type !== 'data_table').map(reference => reference.assetId);
        const uploadedAt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
        newAttachments = references.map((attachment: PersistedAttachment, index) => ({
          id: `iatt-${attachment.assetId}-${createRequestId.current}-${index}`,
          name: attachment.name,
          size: attachment.size === null ? '—' : attachment.size > 1024 * 1024 ? `${(attachment.size / (1024 * 1024)).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(attachment.size / 1024))} کیلوبایت`,
          url: attachment.previewUrl,
          uploadedBy: currentUser.id,
          uploadedAt,
        }));
        persistedAttachments.current = newAttachments;
      }

      const baseData = {
        flowStages: flowStages.filter(stage => stage.trim()).map((stageTitle, index) => ({
          id: ideaToEdit?.flowStages?.[index]?.id || `idea-stage-${createRequestId.current}-${index}`,
          title: stageTitle.trim(),
          status: ideaToEdit?.flowStages?.[index]?.status || (index === 0 ? 'in_progress' as const : 'pending' as const),
        })),
        processTemplateId: undefined,
        title: title.trim(),
        description: description.trim(),
        estimatedEffort: estimatedEffort.trim(),
        estimatedBudget: estimatedBudget.trim(),
        priority,
        category: category || undefined,
        departmentId: departmentId || undefined,
        projectId: projectId || undefined,
        tags,
        attachments: [...(ideaToEdit?.attachments || []), ...newAttachments],
      };

      let savedIdeaId = ideaToEdit?.id || '';
      if (isEditing && ideaToEdit) {
        await updateIdea(ideaToEdit.id, baseData);
      } else {
        const savedIdea = await addIdea({
          ...baseData,
          status: 'submitted',
          clientRequestId: createRequestId.current,
          hasPoll,
          pollQuestion: hasPoll ? pollQuestion.trim() : undefined,
          pollOptions: hasPoll ? pollOptions.filter(option => option.trim()).map((text, index) => ({ id: `opt-${index + 1}`, text: text.trim(), votes: [] })) : undefined,
        });
        savedIdeaId = savedIdea.id;
      }
      if (/^\d+$/.test(savedIdeaId)) {
        await Promise.all(persistedAssetIds.current.map(assetId => request(`/dam/library/${assetId}/relations`, {
          method: 'POST',
          body: { related_type: 'idea', related_id: Number(savedIdeaId) },
        })));
      }
      onClose();
    } catch (error) {
      console.error('Creating idea failed.', error);
      setSubmitError(error instanceof Error ? error.message : 'ذخیره ایده در سرور انجام نشد. دوباره تلاش کنید.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-amber-300">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">{isEditing ? 'ویرایش ایده' : 'ثبت ایده و پیشنهاد در اتاق فکر'}</h2>
              <p className="text-xs text-slate-300">
                {isEditing ? (
                  <>کد ایده: <span className="font-mono font-bold text-amber-300" dir="ltr">{ideaToEdit?.code}</span></>
                ) : 'شرح ایده و ارزیابی جمعی در سازمان'}
              </p>
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
        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
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

          {/* Unified idea description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              توضیحات <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ایده، مسئله یا فرصتی که به آن پاسخ می‌دهد و پیشنهاد اجرایی خود را توضیح دهید..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Metadata Grid */}
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
            <div><h3 className="text-sm font-bold text-indigo-900">جریان اختصاصی ایده</h3><p className="mt-1 text-[11px] text-indigo-700">ایده الگو ندارد؛ مراحل این ایده را همین‌جا و مستقل از جریان محتوا تعریف کنید.</p></div>
            <div className="space-y-2">{flowStages.map((stage, index) => <div key={index} className="flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center">{index + 1}</span><input required value={stage} onChange={event => setFlowStages(previous => previous.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className="flex-1 bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs" placeholder="عنوان مرحله" />{flowStages.length > 1 && <button type="button" aria-label="حذف مرحله" onClick={() => setFlowStages(previous => previous.filter((_, itemIndex) => itemIndex !== index))} className="ui-button ui-button-ghost ui-icon-button text-rose-600"><Trash2 className="w-4 h-4" /></button>}</div>)}</div>
            <button type="button" onClick={() => setFlowStages(previous => [...previous, ''])} className="ui-button ui-button-secondary"><Plus className="w-4 h-4" />افزودن مرحله</button>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">پروژه مرتبط (اختیاری)</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white">
                <option value="">بدون پروژه</option>{projects.filter(project => project.status !== 'archived' || project.id === ideaToEdit?.projectId).map(project => <option key={project.id} value={project.id}>{project.name}{project.status === 'archived' ? ' (بایگانی‌شده)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                دپارتمان مرتبط
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">بدون دپارتمان مشخص</option>
                {availableDepartments.map(department => <option key={department.id} value={department.id}>{department.name}{department.status === 'inactive' ? ' (غیرفعال)' : ''}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                دسته‌بندی ایده
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">بدون دسته‌بندی</option>
                {ideaCategories.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <div className="mt-2 flex items-center gap-2">
                <input value={newCategory} maxLength={80} onChange={event => setNewCategory(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void handleAddCategory(); } }} placeholder="دسته‌بندی جدید" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden" />
                <button type="button" onClick={() => void handleAddCategory()} disabled={!newCategory.trim() || isAddingCategory} className="ui-button ui-button-secondary shrink-0 disabled:opacity-50"><Plus className="h-4 w-4" />{isAddingCategory ? 'در حال افزودن…' : 'افزودن'}</button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">دارندگان مجوز ایجاد ایده می‌توانند دسته‌بندی تازه را همین‌جا ثبت کنند.</p>
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
                    required={hasPoll}
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
                          required={hasPoll}
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

          <AttachmentComposer
            value={attachmentDraft}
            onChange={value => { persistedAttachments.current = null; setAttachmentDraft(value); }}
            disabled={isSubmitting}
            title="ضمیمه‌های ایده"
            defaultFolderLabel={`پیش‌فرض خودکار: ایده‌ها / ${title.trim() || 'نام ایده'} / فایل`}
          />

          {submitError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{submitError}</p>}
          </div>

          {/* Footer Submit */}
          <div className="shrink-0 border-t border-slate-200 bg-white p-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white shadow-md transition-all flex items-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال ذخیره...' : isEditing ? 'ذخیره تغییرات' : 'ثبت ایده'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    </>
  );
};
