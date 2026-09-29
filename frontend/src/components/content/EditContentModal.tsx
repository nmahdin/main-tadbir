import { Modal } from '../common/Primitives';
import React, { useState, useEffect } from 'react';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import { Content, ContentStatus } from '../../types';
import { X, Edit3, CheckCircle2, Save, Trash2, Globe } from 'lucide-react';

interface EditContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content | null;
}

export const EditContentModal: React.FC<EditContentModalProps> = ({ isOpen, onClose, content }) => {
  const { pendingMutationKeys, departments, users, projects, publishingPlatforms, contentTypes, updateContent, deleteContent, setActiveView, hasPermission } = useApp();

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
    }
  }, [content]);

  if (!isOpen || !content) return null;

  const toggleChannel = (chKey: string) => {
    setChannels(prev => 
      prev.includes(chKey) ? prev.filter(c => c !== chKey) : [...prev, chKey]
    );
  };

  const busy = pendingMutationKeys.includes(`contents:${content.id}`);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) return;

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
      deadline: deadline || undefined,

    });

    if (!saved) return;
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
    <Modal open={isOpen} title="ویرایش پرونده محتوا" onClose={onClose} busy={busy}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
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
                  <option key={p.id} value={p.id}>{p.name} [{p.key}]</option>
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
                <option value="in_progress">در حال انجام</option>
                <option value="reviewing">در انتظار بازبینی</option>
                <option value="revising">نیازمند اصلاح</option>
                <option value="approving">در انتظار تأیید</option>
                <option value="approved" disabled>تأییدشده</option>
                <option value="ready_to_publish">آماده انتشار</option>
                <option value="published" disabled>منتشرشده</option>
                <option value="completed">انجام شده</option>
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
                disabled value={publisherId}
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
              <input
                type="text"
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500"
              />
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

          {/* Publishing is a separate authorized command. */}
          <p className="text-xs text-slate-600">ناشر و برنامهٔ انتشار را از برگهٔ انتشار تغییر دهید؛ این فرم مشخصات محتوا را ذخیره می‌کند.</p>
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

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
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
              <button
                type="button"
                disabled={busy} onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit" disabled={busy}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </form>
    </Modal>
  );
};
