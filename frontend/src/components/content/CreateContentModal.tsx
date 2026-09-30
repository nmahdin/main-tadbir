import { Modal } from '../common/Primitives';
import React, { useState, useEffect } from 'react';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import { X, FileText, CheckCircle2, Layers } from 'lucide-react';
import { InlineSpinner } from '../common/Feedback';

export const CreateContentModal: React.FC<{ isOpen?: boolean; onClose?: () => void }> = ({ isOpen, onClose }) => {
  const { departments, users, projects, processTemplates, contentTypes, addContent, setSelectedContentId, setActiveView, currentUser, hasPermission, isCreateContentOpen, setIsCreateContentOpen, contentCreateProjectId, setContentCreateProjectId } = useApp();
  const modalOpen = isOpen ?? isCreateContentOpen;
  const closeModal = onClose ?? (() => setIsCreateContentOpen(false));
  
  const [submitting,setSubmitting]=useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: contentTypes[0]?.id || 'video',
    isRecurring: false,
    recurrenceInterval: 'weekly',
    recurrenceCount: 4,
    topic: '',
    targetAudience: '',
    mediaGoal: '',
    departmentId: departments[0]?.id || '',
    processTemplateId: processTemplates[0]?.id || '',
    projectId: '',
    ownerId: currentUser.id,
    approverId: '',
    deadline: '',
    channels: ['website'] as string[]
  });

  useEffect(() => {
    if (modalOpen && contentCreateProjectId) {
      setFormData(prev => ({ ...prev, projectId: contentCreateProjectId }));
    }
    if (!modalOpen && contentCreateProjectId) {
      setContentCreateProjectId(null);
    }
  }, [modalOpen, contentCreateProjectId, setContentCreateProjectId]);

  if (!modalOpen || !hasPermission('content.create')) return null;

  const selectedTemplate = processTemplates.find(t => t.id === formData.processTemplateId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || submitting) return;
    setSubmitting(true);
    try {

    const created = await addContent({
      title: formData.title.trim(),
      description: formData.description.trim(),
      type: formData.type,
      topic: formData.topic.trim(),
      targetAudience: formData.targetAudience.trim(),
      mediaGoal: formData.mediaGoal.trim(),
      departmentId: formData.departmentId || departments[0]?.id,
      isRecurring: formData.isRecurring,
      recurrenceInterval: formData.isRecurring ? (formData.recurrenceInterval as 'daily' | 'weekly' | 'monthly') : undefined,
      recurrenceCount: formData.isRecurring ? formData.recurrenceCount : undefined,
      processTemplateId: formData.processTemplateId || undefined,
      projectId: formData.projectId || undefined,
      ownerId: formData.ownerId || currentUser.id,
      approverId: formData.approverId,
      deadline: formData.deadline || undefined,
      publishInfo: {
        channels: formData.channels.length > 0 ? formData.channels : ['website'],
        status: 'planned'
      }
    });

    if (!created) return;
    closeModal();
    setSelectedContentId(created.id);
    setActiveView('content-detail');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal open={modalOpen} onClose={closeModal} busy={submitting} title="تشکیل پرونده تولید محتوا">
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">عنوان پرونده محتوا <span className="text-rose-500">*</span></label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="مثال: موشن گرافیک معرفی گزارش عملکرد..."
            />
          </div>

          {/* Content Type (from settings) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">نوع محتوا</label>
            <select
              value={formData.type}
              onChange={e => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
            >
              {contentTypes.map(ct => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
          </div>

          {/* Process Template Selector */}
          <div className="space-y-1.5 bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-100/70">
            <label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>الگوی فرایند تولید محتوا (Blueprint Workflow)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
              {processTemplates.map(tpl => {
                const isSelected = formData.processTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      processTemplateId: tpl.id
                    })}
                    className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="text-xs font-black truncate">{tpl.name}</div>
                    <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {tpl.stages.length} مرحله فرایندی
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedTemplate && (
              <div className="mt-2 text-[11px] text-indigo-700 flex items-center gap-1.5 flex-wrap">
                <span className="font-bold">مراحل فرایند:</span>
                {selectedTemplate.stages.map((s, idx) => (
                  <span key={idx} className="bg-white/80 px-2 py-0.5 rounded-md border border-indigo-100 text-[10px] font-medium">
                    {idx + 1}. {s.title} ({s.departmentName})
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">اتصال به پروژه سازمانی</label>
              <select
                value={formData.projectId}
                onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                <option value="">بدون پروژه مستقیم (محتوای مستقل)</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} [{p.key}]</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">دپارتمان اصلی</label>
              <select
                value={formData.departmentId}
                onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">مدیر پرونده محتوا</label>
              <select
                value={formData.ownerId}
                onChange={e => setFormData({ ...formData, ownerId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">تأییدکننده نهایی محتوا</label>
              <select
                value={formData.approverId}
                onChange={e => setFormData({ ...formData, approverId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                <option value="">(انتخاب نشده)</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">مهلت نهایی انتشار</label>
              <PersianDatePicker
                value={formData.deadline}
                onChange={(val) => setFormData({ ...formData, deadline: val })}
                placeholder="انتخاب مهلت"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">مخاطب هدف</label>
              <input
                type="text"
                value={formData.targetAudience}
                onChange={e => setFormData({ ...formData, targetAudience: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
                placeholder="مثال: دانشجویان، رسانه‌ها، عموم..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">هدف رسانه‌ای / پیام کلیدی</label>
              <input
                type="text"
                value={formData.mediaGoal}
                onChange={e => setFormData({ ...formData, mediaGoal: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
                placeholder="مثال: بازتاب دستاوردها..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">توضیحات و سناریوی اولیه</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500 resize-none"
              placeholder="نکات کلیدی، ملزومات و شرح ایده..."
            ></textarea>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              disabled={submitting} onClick={closeModal}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit" disabled={submitting} aria-busy={submitting}
              className="min-w-48 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-wait disabled:opacity-80"
            >
              {submitting ? <InlineSpinner size="sm" className="text-white" /> : <CheckCircle2 className="w-4 h-4" />}
              {submitting ? 'در حال ذخیره محتوا…' : 'ایجاد پرونده و راه‌اندازی فرایند'}
            </button>
          </div>
        </form>
    </Modal>
  );
};
