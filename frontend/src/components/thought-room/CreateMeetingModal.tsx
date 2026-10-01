import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Users, Plus, Trash2, Lightbulb, CheckCircle2, Video, ExternalLink, LoaderCircle } from 'lucide-react';
import { ThinkTankMeeting } from '../../types';
import { useApp } from '../../context/AppContext';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { AttachmentComposer, PersistedAttachment, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';

interface CreateMeetingModalProps {
  isOpen: boolean;
  meeting?: ThinkTankMeeting | null;
  onClose: () => void;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({ isOpen, onClose, meeting }) => {
  const { updateThinkTankMeeting, addThinkTankMeeting, createMeetingGoogleMeet, appendMeetingAttachments, googleMeetSettings, users, ideas, currentUser } = useApp();

  const [savedMeetingId, setSavedMeetingId] = useState<string | null>(meeting?.id || null);
  const [title, setTitle] = useState(meeting?.title || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingMeet, setIsCreatingMeet] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [description, setDescription] = useState(meeting?.description || '');
  const [date, setDate] = useState(meeting?.date || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(meeting?.time || '۱۰:۰۰');
  const [duration, setDuration] = useState(meeting?.duration || `${googleMeetSettings.defaultDurationMinutes.toLocaleString('fa-IR')} دقیقه`);
  const [locationType, setLocationType] = useState<'in_person' | 'online' | 'hybrid'>(meeting?.locationType || 'in_person');
  const [locationDetails, setLocationDetails] = useState(meeting?.locationDetails || '');
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>(meeting?.attendeeIds || [currentUser.id]);
  const [selectedIdeaIds, setSelectedIdeaIds] = useState<string[]>(meeting?.relatedIdeaIds || []);
  const [agendaItems, setAgendaItems] = useState<string[]>((meeting?.agenda || []).map(a => typeof a === 'string' ? a : a.title));
  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);

  useEffect(() => {
    if (isOpen) setAttachmentDraft(createEmptyAttachmentDraft());
  }, [isOpen, meeting?.id]);

  if (!isOpen) return null;

  const handleAddAgenda = () => {
    setAgendaItems([...agendaItems, '']);
  };

  const handleRemoveAgenda = (idx: number) => {
    setAgendaItems(agendaItems.filter((_, i) => i !== idx));
  };

  const handleAgendaChange = (idx: number, val: string) => {
    const updated = [...agendaItems];
    updated[idx] = val;
    setAgendaItems(updated);
  };

  const toggleAttendee = (userId: string) => {
    if (selectedAttendeeIds.includes(userId)) {
      setSelectedAttendeeIds(selectedAttendeeIds.filter(id => id !== userId));
    } else {
      setSelectedAttendeeIds([...selectedAttendeeIds, userId]);
    }
  };

  const toggleIdea = (ideaId: string) => {
    if (selectedIdeaIds.includes(ideaId)) {
      setSelectedIdeaIds(selectedIdeaIds.filter(id => id !== ideaId));
    } else {
      setSelectedIdeaIds([...selectedIdeaIds, ideaId]);
    }
  };

  const meetingData = () => ({
    title: title.trim(),
    description: description.trim(),
    date: date.trim(),
    time: time.trim(),
    duration: duration.trim(),
    locationType,
    locationDetails: locationDetails.trim(),
    attendeeIds: selectedAttendeeIds,
    relatedIdeaIds: selectedIdeaIds,
    agenda: agendaItems.filter(a => a.trim()).map((agendaTitle, index) => ({ ...(meeting?.agenda?.[index] && typeof meeting.agenda[index] === 'object' ? meeting.agenda[index] : {}), id: meeting?.agenda?.[index]?.id || crypto.randomUUID(), title: agendaTitle, completed: meeting?.agenda?.[index]?.completed || false }))
  });

  const handleCreateGoogleMeet = async () => {
    if (!title.trim() || !date.trim() || !time.trim() || isSubmitting || isCreatingMeet) {
      setSubmitError('برای ایجاد Google Meet، عنوان، تاریخ و ساعت جلسه را کامل کنید.');
      return;
    }
    setIsCreatingMeet(true);
    setSubmitError('');
    try {
      const saved = savedMeetingId ? await updateThinkTankMeeting(savedMeetingId, meetingData()) : await addThinkTankMeeting(meetingData());
      setSavedMeetingId(saved.id);
      const updated = await createMeetingGoogleMeet(saved.id);
      setLocationType('online');
      setLocationDetails(updated.locationDetails || '');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'ایجاد Google Meet انجام نشد؛ تنظیمات اتصال را بررسی کنید.');
    } finally {
      setIsCreatingMeet(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim() || !time.trim() || isSubmitting || isCreatingMeet) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const created = savedMeetingId ? await updateThinkTankMeeting(savedMeetingId, meetingData()) : await addThinkTankMeeting(meetingData());
      setSavedMeetingId(created.id);
      if (attachmentDraftCount(attachmentDraft) > 0) {
        const references = await persistAttachmentDraft(attachmentDraft, {}, created.title);
        const uploadedAt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
        const metadata = references.map((attachment: PersistedAttachment, index) => ({
          id: `matt-${attachment.assetId}-${Date.now()}-${index}`,
          name: attachment.name,
          size: attachment.size === null ? '—' : attachment.size > 1024 * 1024 ? `${(attachment.size / (1024 * 1024)).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(attachment.size / 1024))} کیلوبایت`,
          url: attachment.previewUrl,
          uploadedBy: currentUser.id,
          uploadedAt,
        }));
        await appendMeetingAttachments(created.id, metadata);
        setAttachmentDraft(createEmptyAttachmentDraft());
      }
      onClose();
    } catch (error) {
      console.error('Creating think tank meeting failed.', error);
      setSubmitError(error instanceof Error ? error.message : 'ذخیره جلسه در سرور انجام نشد. دوباره تلاش کنید.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">{meeting ? 'ویرایش جلسه' : 'برنامه‌ریزی جلسه جدید'}</h2>
              <p className="text-xs text-indigo-200">طوفان فکری، بررسی طرح‌ها و مصوبات جمعی</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              موضوع یا عنوان جلسه <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: جلسه بررسی استراتژی تحول دیجیتال و چابک‌سازی"
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                تاریخ برگزاری (شمسی)
              </label>
              <PersianDatePicker
                value={date}
                onChange={setDate}
                placeholder="انتخاب تاریخ برگزاری"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                ساعت شروع
              </label>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="۱۰:۰۰"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                مدت زمان جلسه
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="۶۰ دقیقه"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                نحوه برگزاری
              </label>
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value as any)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="in_person">حضوری</option>
                <option value="online">آنلاین / مجازی</option>
                <option value="hybrid">ترکیبی (حضوری و آنلاین)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                محل یا لینک جلسه
              </label>
              <input
                type="text"
                value={locationDetails}
                onChange={(e) => setLocationDetails(e.target.value)}
                placeholder="اتاق جلسات / لینک Google Meet"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><p className="text-xs font-black text-indigo-900">جلسه آنلاین با Google Meet</p><p className="mt-1 text-[11px] text-indigo-700">جلسه ابتدا ذخیره می‌شود و لینک در Google Calendar برای زمان انتخاب‌شده ساخته خواهد شد.</p></div>
            {/^https?:\/\//i.test(locationDetails) ? <a href={locationDetails} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary shrink-0 text-xs"><ExternalLink className="h-4 w-4" />باز کردن Meet</a> : googleMeetSettings.enabled ? <button type="button" onClick={() => void handleCreateGoogleMeet()} disabled={isCreatingMeet || isSubmitting} className="ui-button ui-button-primary shrink-0 text-xs disabled:opacity-50">{isCreatingMeet ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}{isCreatingMeet ? 'در حال ایجاد…' : 'ایجاد Google Meet'}</button> : <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500">در تنظیمات غیرفعال است</span>}
          </div>

          {/* Agenda items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                دستور کار و سرفصل‌های جلسه (Agenda)
              </label>
              <button
                type="button"
                onClick={handleAddAgenda}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="w-3.5 h-3.5" />
                افزودن بند دستور کار
              </button>
            </div>
            <div className="space-y-2">
              {agendaItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 text-center font-mono text-xs text-slate-400 font-bold">{idx + 1}.</span>
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleAgendaChange(idx, e.target.value)}
                    placeholder={`بند ${idx + 1}`}
                    className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                  {agendaItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAgenda(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Linked Ideas */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ایده‌های مرتبط مورد بحث در جلسه
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {ideas.map((idea) => {
                const isSelected = selectedIdeaIds.includes(idea.id);
                return (
                  <div
                    key={idea.id}
                    onClick={() => toggleIdea(idea.id)}
                    className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-all ${
                      isSelected ? 'border-indigo-500 bg-indigo-50 text-indigo-900 font-semibold' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <Lightbulb className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="line-clamp-1">{idea.code}: {idea.title}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attendees */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              مدعوین و اعضای حاضر در جلسه ({selectedAttendeeIds.length} نفر)
            </label>
            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
              {users.map((u) => {
                const isSelected = selectedAttendeeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAttendee(u.id)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-medium shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{u.name}</span>
                    <span className="text-[10px] opacity-75">({u.role})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <AttachmentComposer value={attachmentDraft} onChange={setAttachmentDraft} disabled={isSubmitting} title="ضمیمه‌های جلسه" />

          {submitError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{submitError}</p>}
          </div>

          {/* Submit */}
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
              disabled={isSubmitting || isCreatingMeet}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال ذخیره...' : 'ثبت و ارسال دعوت‌نامه جلسه'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
