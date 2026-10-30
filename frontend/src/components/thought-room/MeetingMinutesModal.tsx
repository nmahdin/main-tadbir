import React, { useState } from 'react';
import { X, FileText, CheckCircle2, Plus, Trash2, CheckSquare, User, Paperclip, Download } from 'lucide-react';
import { ThinkTankMeeting, MeetingActionItem, MeetingAttachment } from '../../types';
import { useApp } from '../../context/AppContext';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { formatPersianDate } from '../../utils/date';
import { AttachmentComposer, PersistedAttachment, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';

interface MeetingMinutesModalProps {
  meeting: ThinkTankMeeting | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MeetingMinutesModal: React.FC<MeetingMinutesModalProps> = ({
  meeting,
  isOpen,
  onClose
}) => {
  const { addMeetingMinutes, convertActionItemToTask, users, projects, appendMeetingAttachments, removeMeetingAttachment, currentUser } = useApp();
  /**
   * ضمیمه‌ها با همان قالبِ مشترکِ سامانه (`AttachmentComposer`) ثبت می‌شوند: فایل،
   * یادداشت متنی، دارایی موجود مخزن و جدول اطلاعات، با پوشهٔ مقصد، پیش‌نمایش و
   * عنوان دلخواه — دقیقاً همان چیزی که در فرم ساخت جلسه و بقیهٔ فرم‌ها هست.
   * پیش‌تر این بخش فقط یک دکمهٔ «افزودن فایل» داشت.
   */
  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  const [minutesSummary, setMinutesSummary] = useState(
    meeting?.minutesSummary || 'جلسه با حضور اعضا تشکیل و پس از بررسی طرح‌های پیشنهادی، نتایج و تصمیمات زیر مصوب گردید:'
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [decisions, setDecisions] = useState<string[]>(meeting?.decisions || []);
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>(meeting?.actionItems || []);

  const [selectedConvertProjectId, setSelectedConvertProjectId] = useState(projects[0]?.id || '');

  const [presentIds, setPresentIds] = useState<string[]>(
    meeting?.presentIds || meeting?.attendeeIds || []
  );

  const togglePresent = (userId: string) => {
    setPresentIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const invitedUsers = (meeting?.attendeeIds || []).map(id => users.find(u => u.id === id)).filter(Boolean);
  const absentUsers = invitedUsers.filter(u => u && !presentIds.includes(u.id));

  if (!isOpen || !meeting) return null;

  const handleAddDecision = () => {
    setDecisions([...decisions, '']);
  };

  const handleRemoveDecision = (idx: number) => {
    setDecisions(decisions.filter((_, i) => i !== idx));
  };

  const handleDecisionChange = (idx: number, val: string) => {
    const updated = [...decisions];
    updated[idx] = val;
    setDecisions(updated);
  };

  const handleAddActionItem = () => {
    setActionItems([
      ...actionItems,
      {
        id: `act-${Date.now()}`,
        title: '',
        assigneeId: users[0]?.id || '',
        deadline: '',
        status: 'pending'
      }
    ]);
  };

  const handleRemoveActionItem = (idx: number) => {
    setActionItems(actionItems.filter((_, i) => i !== idx));
  };

  const handleActionItemChange = (idx: number, key: keyof MeetingActionItem, val: any) => {
    const updated = [...actionItems];
    updated[idx] = { ...updated[idx], [key]: val };
    setActionItems(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setSaveError(''); setAttachmentError('');
    try {
      await addMeetingMinutes(
        meeting.id,
        minutesSummary.trim(),
        decisions.filter(d => d.trim()),
        actionItems.filter(a => a.title.trim()),
        presentIds
      );
      // ضمیمه‌ها با همان مسیر مشترکِ سامانه در مخزن ثبت و به همین جلسه وصل می‌شوند.
      // اگر ثبت ضمیمه نیمه‌کاره بماند، صورت‌جلسه از دست نمی‌رود و پیش‌نویس
      // ضمیمه‌ها در همین فرم می‌ماند تا با یک تلاش دوباره کامل شود.
      if (attachmentDraftCount(attachmentDraft) > 0) {
        setAttachmentSaving(true);
        try {
          const references = await persistAttachmentDraft(attachmentDraft, { meetingId: meeting.id }, meeting.title);
          const uploadedAt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
          const metadata: MeetingAttachment[] = references.map((attachment: PersistedAttachment, index) => ({
            id: `matt-${attachment.assetId}-${Date.now()}-${index}`,
            name: attachment.name,
            size: attachment.size === null ? '—' : attachment.size > 1024 * 1024 ? `${(attachment.size / (1024 * 1024)).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(attachment.size / 1024))} کیلوبایت`,
            url: attachment.previewUrl,
            uploadedBy: currentUser.id,
            uploadedAt,
          }));
          await appendMeetingAttachments(meeting.id, metadata);
          setAttachmentDraft(createEmptyAttachmentDraft());
        } catch (error) {
          console.error('Saving meeting attachments failed.', error);
          setAttachmentError('صورت‌جلسه ثبت شد، اما ثبت ضمیمه‌ها کامل نشد. موارد باقی‌مانده در همین فرم هستند؛ دوباره «نهایی‌سازی و ثبت صورت‌جلسه» را بزنید.');
          return;
        } finally {
          setAttachmentSaving(false);
        }
      }
      onClose();
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'صورت‌جلسه ذخیره نشد'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">ثبت صورتجلسه و مصوبات اتاق فکر</h2>
              <p className="text-xs text-slate-300">جلسه: {meeting.title} ({formatPersianDate(meeting.date)})</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Minutes Summary */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              خلاصه مباحث و گزارش مشروح مذاکرات جلسه
            </label>
            <textarea
              rows={4}
              required
              value={minutesSummary}
              onChange={(e) => setMinutesSummary(e.target.value)}
              className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Decisions List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                تصمیمات و نتایج نهایی مصوب جلسه
              </label>
              <button
                type="button"
                onClick={handleAddDecision}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="w-3.5 h-3.5" />
                افزودن مصوبه
              </button>
            </div>

            <div className="space-y-2">
              {decisions.map((dec, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 text-center font-mono text-xs text-emerald-700 font-bold">{idx + 1}.</span>
                  <input
                    type="text"
                    value={dec}
                    onChange={(e) => handleDecisionChange(idx, e.target.value)}
                    placeholder={`مصوبه ${idx + 1}`}
                    className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 bg-emerald-50/30 focus:ring-2 focus:ring-emerald-500"
                  />
                  {decisions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDecision(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Items to Tasks */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                  اقدامات اجرایی و وظایف مصوب (Action Items)
                </h4>
                <p className="text-[11px] text-slate-500">این اقدامات می‌توانند مستقیماً به عنوان Task در پروژه‌ها ثبت شوند.</p>
              </div>
              <button
                type="button"
                onClick={handleAddActionItem}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="w-3.5 h-3.5" />
                افزودن اقدام
              </button>
            </div>

            <div className="space-y-3">
              {actionItems.map((item, idx) => (
                <div key={item.id || idx} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleActionItemChange(idx, 'title', e.target.value)}
                      placeholder="عنوان اقدام..."
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveActionItem(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 shrink-0">مسئول اقدام:</span>
                      <select
                        value={item.assigneeId}
                        onChange={(e) => handleActionItemChange(idx, 'assigneeId', e.target.value)}
                        className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 shrink-0">مهلت انجام:</span>
                      <span className="flex-1">
                        <PersianDatePicker
                          value={item.deadline}
                          onChange={(val) => handleActionItemChange(idx, 'deadline', val)}
                          placeholder="انتخاب مهلت"
                        />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Attendance: invited vs present */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-4 h-4 text-indigo-600" />
                حاضرین و غایبین جلسه
              </h4>
              <div className="flex items-center gap-2 text-[11px] font-bold">
                <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700">
                  حاضر: {presentIds.length} نفر
                </span>
                <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-700">
                  غایب: {absentUsers.length} نفر
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mb-2.5">
              افراد دعوت‌شده به جلسه؛ تیک افراد حاضر را بزنید تا غایبین مشخص شوند.
            </p>
            {invitedUsers.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-3">کسی به این جلسه دعوت نشده است.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {invitedUsers.map((u) => u && (
                  <label
                    key={u.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      presentIds.includes(u.id)
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={presentIds.includes(u.id)}
                      onChange={() => togglePresent(u.id)}
                      className="w-4 h-4 rounded-sm text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold text-slate-800 truncate">{u.name}</span>
                      <span className="block text-[10px] text-slate-500 truncate">{u.title || u.department || ''}</span>
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${presentIds.includes(u.id) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {presentIds.includes(u.id) ? 'حاضر' : 'غایب'}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Meeting Attachments — همان قالب مشترک ضمیمه‌های سامانه */}
          <AttachmentComposer
            value={attachmentDraft}
            onChange={setAttachmentDraft}
            disabled={saving || attachmentSaving}
            title="ضمیمه‌های صورت‌جلسه"
            defaultFolderLabel={`جلسات / ${meeting.title} / فایل`}
          />

          {attachmentError && (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold leading-6 text-amber-900">
              {attachmentError}
            </p>
          )}

          {/* پیوست‌های ثبت‌شدهٔ همین جلسه */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Paperclip className="w-4 h-4 text-indigo-600" />
                پیوست‌های ثبت‌شدهٔ جلسه ({(meeting.attachments || []).length})
              </h4>
              {attachmentDraftCount(attachmentDraft) > 0 && (
                <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-indigo-700">
                  {attachmentDraftCount(attachmentDraft).toLocaleString('fa-IR')} مورد تازه در انتظار ثبت
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">با ثبت صورت‌جلسه، موارد بالا به همین فهرست اضافه می‌شوند و لینک پایدار مخزن را می‌گیرند.</p>
            {(meeting.attachments || []).length === 0 ? (
              <p className="py-3 text-center text-[11px] text-slate-400">هنوز پیوستی برای این جلسه ثبت نشده است.</p>
            ) : (
              <div className="mt-2.5 space-y-2">
                {(meeting.attachments || []).map((att) => (
                  <div key={att.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800" title={att.name}>{att.name}</p>
                      <p className="text-[10px] text-slate-500">{att.size}{att.uploadedAt ? ` • ${att.uploadedAt}` : ''}</p>
                    </div>
                    {att.url && (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50"
                        title="دانلود / مشاهده"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMeetingAttachment(meeting.id, att.id)}
                      className="rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50"
                      title="حذف پیوست"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {saveError && <p role="alert" className="text-xs text-rose-700">{saveError}</p>}
          {/* Submit */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button data-button-action="cancel"
              type="button"
              onClick={onClose}
              className="ui-form-action px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              انصراف
            </button>
            <button data-button-action="save"
              type="submit" disabled={saving || attachmentSaving}
              className="ui-form-action px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'در حال ذخیره…' : 'نهایی‌سازی و ثبت صورتجلسه'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
