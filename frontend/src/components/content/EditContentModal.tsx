import { Modal } from '../common/Primitives';
import React, { useState, useEffect } from 'react';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import { Content, ContentStatus } from '../../types';
import { CheckCircle2, Save, Trash2, Globe, ChevronLeft, ChevronRight, FileText, Users, Paperclip } from 'lucide-react';
import { InlineSpinner } from '../common/Feedback';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';

interface EditContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content | null;
}

export const EditContentModal: React.FC<EditContentModalProps> = ({ isOpen, onClose, content }) => {
  const { pendingMutationKeys, departments, users, projects, publishingPlatforms, contentTypes, targetAudiences, updateContent, addContentAttachment, scheduleContentPublication, deleteContent, setActiveView, hasPermission } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('video');
  const [status, setStatus] = useState<ContentStatus>('idea');
  const [topic, setTopic] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [mediaGoal, setMediaGoal] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [publisherId, setPublisherId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (content) {
      setTitle(content.title || '');
      setDescription(content.description || '');
      setType(content.type || 'video');
      setStatus(content.status || 'idea');
      setTopic(content.topic || '');
      setTargetAudience(content.targetAudience || '');
      setMediaGoal(content.mediaGoal || '');
      setDepartmentId(content.departmentId || '');
      setProjectId(content.projectId || '');
      setOwnerId(content.ownerId || '');
      setPublisherId(content.publisherId || '');
      setDeadline(content.deadline || '');
      setChannels(content.publishInfo?.channels || ['website']);
      setCaption(content.publishInfo?.caption || '');
      setIsRecurring(content.isRecurring || false);
      setRecurrenceInterval(content.recurrenceInterval || 'weekly');
      setRecurrenceCount(content.recurrenceCount || 4);
      setAttachmentDraft(createEmptyAttachmentDraft());
      setStep(1);
    }
  }, [content]);

  if (!isOpen || !content) return null;

  const toggleChannel = (chKey: string) => {
    setChannels(prev => 
      prev.includes(chKey) ? prev.filter(c => c !== chKey) : [...prev, chKey]
    );
  };

  const busy = pendingMutationKeys.includes(`contents:${content.id}`);
  const isPublished = content.status === 'published' || content.publishInfo?.status === 'published';
  const canEditCaption = hasPermission('content.publish') && !isPublished;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) return;

    if (canEditCaption && caption.trim() !== (content.publishInfo?.caption || '')) {
      await scheduleContentPublication(content.id, {
        publisherId: publisherId || undefined,
        publishInfo: {
          date: content.publishInfo?.date,
          time: content.publishInfo?.time,
          channels: content.publishInfo?.channels || [],
          caption: caption.trim(),
          status: content.publishInfo?.status === 'ready' ? 'ready' : 'planned',
        },
      });
    }

    const saved = await updateContent(content.id, {
      title: title.trim(),
      description: description.trim(),
      type,
      isRecurring,
      recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
      recurrenceCount: isRecurring ? recurrenceCount : undefined,
      status,
      topic: topic.trim(),
      targetAudience: targetAudience.trim(),
      mediaGoal: mediaGoal.trim(),
      departmentId: departmentId || content.departmentId,
      projectId: projectId || undefined,
      ownerId: ownerId || content.ownerId,
      publisherId: publisherId || undefined,
      deadline: deadline || undefined,
    });

    if (!saved) return;
    if (attachmentDraftCount(attachmentDraft) > 0) {
      if (/^\d+$/.test(content.id)) {
        await persistAttachmentDraft(attachmentDraft, {
          contentId: content.id,
          projectId: /^\d+$/.test(projectId) ? projectId : undefined,
        }, title.trim());
      } else {
        for (const file of attachmentDraft.files) await addContentAttachment(content.id, { name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} کیلوبایت`, type: file.type || 'file', url: URL.createObjectURL(file) });
        for (const text of attachmentDraft.texts) await addContentAttachment(content.id, { name: text.title, size: `${text.body.length} نویسه`, type: 'text', url: '#' });
        for (const asset of attachmentDraft.assets) await addContentAttachment(content.id, { name: asset.latest_file?.original_filename || asset.title, size: asset.latest_file?.file_size ? `${Math.max(1, Math.round(asset.latest_file.file_size / 1024))} کیلوبایت` : '—', type: 'document', url: `/api/v1/dam/library/${asset.id}/preview` });
      }
    }
    onClose();
  };

  const handleDelete = async () => {
    if (busy) return;
    if (window.confirm(`آیا از حذف پرونده محتوای «${content.title}» اطمینان دارید؟`)) {
      if (!await deleteContent(content.id)) return;
      onClose();
      setActiveView('content');
    }
  };

  return (
    <Modal open={isOpen} title="ویرایش پرونده محتوا" description="ویرایش مرحله‌ای مشخصات، مسئولیت‌ها و انتشار" onClose={onClose} busy={busy} size="xl">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-white px-5 py-3">{[{ id: 1, label: 'اطلاعات پایه', icon: FileText }, { id: 2, label: 'مسئولیت‌ها', icon: Users }, { id: 3, label: 'انتشار و پیوست', icon: Paperclip }].map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => item.id < step && setStep(item.id)} className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-[10px] font-black sm:text-xs ${step === item.id ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : item.id < step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}><Icon className="h-4 w-4" /><span className="hidden sm:inline">{item.label}</span></button>; })}</div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {step === 1 && <>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">عنوان محتوا <span className="text-rose-500">*</span></label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">نوع محتوا</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                {contentTypes.map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                ))}
              </select>
            </div>
          </div>
          </>}

          {step === 2 && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">اتصال به پروژه سازمانی</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                <option value="">بدون پروژه مستقیم (محتوای مستقل)</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">وضعیت محتوا</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ContentStatus)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                <option value="idea">ایده اولیه</option>
                <option value="planning">برنامه‌ریزی</option>
                <option value="producing">در حال تولید</option>
                <option value="reviewing">در انتظار بازبینی</option>
                <option value="revising">نیازمند اصلاح</option>
                <option value="approving">در انتظار تأیید</option>
                <option value="approved" disabled>تأییدشده</option>
                <option value="ready_to_publish">آماده انتشار</option>
                <option value="published" disabled>منتشرشده</option>
                <option value="suspended">تعلیق</option>
                <option value="cancelled">لغو شده</option>
                <option value="archived">آرشیو</option>
              </select>
            </div>
<div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">دپارتمان مجری</label>
              <select
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">مدیر و صاحب پرونده</label>
              <select
                value={ownerId}
                onChange={e => setOwnerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">ناشر (مسئول انتشار نهایی)</label>
              <select
                value={publisherId}
                onChange={e => setPublisherId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                <option value="">— انتخاب نشده —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">مهلت نهایی انتشار</label>
              <PersianDatePicker
                value={deadline}
                onChange={(val) => setDeadline(val)}
                placeholder="انتخاب مهلت"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">مخاطب هدف</label>
              <select
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              >
                <option value="">انتخاب مخاطب هدف</option>
                {targetAudience && !targetAudiences.includes(targetAudience) && <option value={targetAudience}>{targetAudience} (قدیمی)</option>}
                {targetAudiences.map(audience => <option key={audience} value={audience}>{audience}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">هدف رسانه‌ای / پیام کلیدی</label>
              <input
                type="text"
                value={mediaGoal}
                onChange={e => setMediaGoal(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">توضیحات و سناریوی تولید</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500 resize-none"
            ></textarea>
          </div>
          </>}

          {step === 3 && <>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">متن کپشن</label>
            <textarea
              rows={4}
              maxLength={10000}
              value={caption}
              disabled={!canEditCaption}
              onChange={event => setCaption(event.target.value)}
              placeholder="کپشن نهایی، هشتگ‌ها و دعوت به اقدام را وارد کنید..."
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {!hasPermission('content.publish') && <p className="text-[10px] text-slate-500">ویرایش کپشن نیازمند مجوز برنامه‌ریزی انتشار است.</p>}
            {isPublished && <p className="text-[10px] text-amber-700">برای تغییر کپشن، ابتدا انتشار محتوا را لغو کنید.</p>}
          </div>

          {/* Publication itself remains a separate authorized command. */}
          <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-indigo-600" />
              <span>پلتفرم‌های مقصد انتشار</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {publishingPlatforms.map(p => {
                const isSelected = channels.includes(p.id) || channels.includes(p.name.toLowerCase());
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled onClick={() => toggleChannel(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <AttachmentComposer value={attachmentDraft} onChange={setAttachmentDraft} disabled={busy} title="ضمیمه‌های جدید محتوا" />
          </>}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4">
            {hasPermission('content.delete') && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف این محتوا</span>
            </button>
          )}

            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">انصراف</button>
              {step > 1 && <button type="button" disabled={busy} onClick={() => setStep(current => current - 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"><ChevronRight className="h-4 w-4" />مرحله قبل</button>}
              {step < 3 ? <button type="button" disabled={step === 1 && !title.trim()} onClick={() => setStep(current => current + 1)} className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">مرحله بعد<ChevronLeft className="h-4 w-4" /></button> : <button type="submit" disabled={busy} aria-busy={busy} className="min-w-36 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-80">{busy ? <InlineSpinner size="sm" className="text-white" /> : <Save className="w-4 h-4" />}<span>{busy ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</span></button>}
            </div>
          </div>
        </form>
    </Modal>
  );
};
