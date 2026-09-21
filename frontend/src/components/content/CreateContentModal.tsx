import React, { useState } from 'react';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import { X, FileText, CheckCircle2, Layers } from 'lucide-react';

export const CreateContentModal: React.FC<{ isOpen?: boolean; onClose?: () => void }> = ({ isOpen, onClose }) => {
  const { departments, users, projects, processTemplates, addContent, setSelectedContentId, setActiveView, currentUser, hasPermission, isCreateContentOpen, setIsCreateContentOpen } = useApp();
  const modalOpen = isOpen ?? isCreateContentOpen;
  const closeModal = onClose ?? (() => setIsCreateContentOpen(false));
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'video',
    topic: '',
    targetAudience: '',
    mediaGoal: '',
    departmentId: departments[0]?.id || '',
    processTemplateId: processTemplates[0]?.id || 'tpl-video',
    projectId: '',
    ownerId: currentUser.id,
    approverId: '',
    deadline: '',
    channels: ['website'] as string[]
  });

  if (!modalOpen || !hasPermission('content.create')) return null;

  const selectedTemplate = processTemplates.find(t => t.id === formData.processTemplateId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const created = addContent({
      title: formData.title.trim(),
      description: formData.description.trim(),
      type: formData.type,
      topic: formData.topic.trim(),
      targetAudience: formData.targetAudience.trim(),
      mediaGoal: formData.mediaGoal.trim(),
      departmentId: formData.departmentId || departments[0]?.id || 'dept-media',
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

    closeModal();
    setSelectedContentId(created.id);
    setActiveView('content-detail');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-right" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">تشکیل پرونده تولید محتوا</h3>
              <p className="text-xs text-slate-500 mt-0.5">تعیین فرایند ساختاریافته، دپارتمان و مراحل تولید</p>
            </div>
          </div>
          <button 
            onClick={closeModal}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                      processTemplateId: tpl.id, 
                      type: tpl.id === 'tpl-poster' ? 'poster' : (tpl.id === 'tpl-podcast' ? 'podcast' : (tpl.id === 'tpl-article' ? 'article' : 'video')) 
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
              onClick={closeModal}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              ایجاد پرونده و راه‌اندازی فرایند
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
