import React, { useState, useRef, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Users, Plus, Trash2, Lightbulb, CheckCircle2, Paperclip, Upload, Library, Search, LoaderCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { request } from '../../api/client';
import { damApi } from '../../api/dam';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({ isOpen, onClose }) => {
  const { addThinkTankMeeting, addMeetingAttachment, appendMeetingAttachments, users, ideas, currentUser } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('۱۴۰۵/۰۲/۱۵');
  const [time, setTime] = useState('۱۰:۰۰');
  const [duration, setDuration] = useState('۹۰ دقیقه');
  const [locationType, setLocationType] = useState<'in_person' | 'online' | 'hybrid'>('in_person');
  const [locationDetails, setLocationDetails] = useState('اتاق جلسات اصلی - طبقه ۳');
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>(users.slice(0, 3).map(u => u.id));
  const [selectedIdeaIds, setSelectedIdeaIds] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState<string[]>([
    'بررسی ایده‌های ارسالی اعضای تیم در زمینه بهینه‌سازی فرآیندها',
    'تصمیم‌گیری در خصوص تبدیل ایده‌های منتخب به پروژه‌های عملیاتی'
  ]);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState<{ id: number; title: string; latest_file?: { original_filename: string; file_size: number } | null }[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLibraryLoading(true);
    request<{ data: { id: number; title: string }[] }>('/dam/library?per_page=20')
      .then(result => setLibraryItems(result.data || []))
      .catch(() => setLibraryItems([]))
      .finally(() => setLibraryLoading(false));
  }, [isOpen]);

  const searchLibrary = async (query: string) => {
    setLibraryQuery(query);
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams({ per_page: '20' });
      if (query.trim()) params.set('search', query.trim());
      const result = await request<{ data: { id: number; title: string }[] }>(`/dam/library?${params}`);
      setLibraryItems(result.data || []);
    } catch {
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim() || !time.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const created = await addThinkTankMeeting({
        title: title.trim(),
        description: description.trim(),
        date: date.trim(),
        time: time.trim(),
        duration: duration.trim(),
        locationType,
        locationDetails: locationDetails.trim(),
        attendeeIds: selectedAttendeeIds,
        relatedIdeaIds: selectedIdeaIds,
        agenda: agendaItems.filter(a => a.trim())
      });
      for (const file of queuedFiles) {
        await addMeetingAttachment(created.id, file);
      }
      if (selectedAssetIds.length > 0) {
        const uploadedAt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
        appendMeetingAttachments(created.id, selectedAssetIds.map((assetId, idx) => {
          const asset = libraryItems.find(a => a.id === assetId);
          const size = asset?.latest_file?.file_size;
          return {
            id: `matt-${Date.now()}-${idx}`,
            name: asset?.latest_file?.original_filename || asset?.title || `فایل ${assetId}`,
            size: size ? (size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(size / 1024))} کیلوبایت`) : '—',
            url: damApi.library.previewUrl(assetId),
            uploadedBy: currentUser.id,
            uploadedAt,
          };
        }));
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
        <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">برنامه‌ریزی و هماهنگی جلسه اتاق فکر</h2>
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

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
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
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="۱۴۰۵/۰۲/۱۵"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
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

          {/* Attachments: upload or pick from DAM */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-indigo-600" />
              فایل‌های ضمیمه جلسه
            </h4>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  آپلود فایل جدید
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-lg text-[11px] font-bold text-indigo-700 cursor-pointer"
                >
                  انتخاب فایل
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    setQueuedFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />
              </div>
              {queuedFiles.length > 0 && (
                <div className="space-y-1.5">
                  {queuedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px]">
                      <span className="font-bold text-slate-700 truncate">{file.name}</span>
                      <button type="button" onClick={() => setQueuedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1.5">
                <Library className="w-3.5 h-3.5" />
                انتخاب از دارایی‌های دیجیتال ({selectedAssetIds.length} انتخاب‌شده)
              </span>
              <div className="relative mb-1.5">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                <input
                  type="text"
                  value={libraryQuery}
                  onChange={(e) => void searchLibrary(e.target.value)}
                  placeholder="جست‌وجو در مخزن..."
                  className="w-full pr-8 pl-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:border-indigo-400 focus:outline-hidden"
                />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1.5">
                {libraryLoading && <p className="text-[11px] text-slate-400 text-center py-2 flex items-center justify-center gap-1.5"><LoaderCircle className="w-3.5 h-3.5 animate-spin" />در حال جست‌وجو...</p>}
                {!libraryLoading && libraryItems.map(asset => {
                  const checked = selectedAssetIds.includes(asset.id);
                  return (
                    <label key={asset.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${checked ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedAssetIds(prev => checked ? prev.filter(id => id !== asset.id) : [...prev, asset.id])}
                        className="w-3.5 h-3.5 rounded-sm text-indigo-600"
                      />
                      <span className="font-bold text-slate-700 truncate">{asset.latest_file?.original_filename || asset.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Submit */}
          {submitError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{submitError}</p>}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
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
