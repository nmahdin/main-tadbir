import React, { useState } from 'react';
import { X, Calendar, Clock, MapPin, Users, Plus, Trash2, Lightbulb, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({ isOpen, onClose }) => {
  const { addThinkTankMeeting, users, ideas } = useApp();

  const [title, setTitle] = useState('');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim() || !time.trim()) return;

    addThinkTankMeeting({
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

    onClose();
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

          {/* Submit */}
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
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ثبت و ارسال دعوت‌نامه جلسه</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
