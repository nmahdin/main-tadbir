import React, { useState } from 'react';
import { X, Award, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface CreateResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateResolutionModal: React.FC<CreateResolutionModalProps> = ({
  isOpen,
  onClose
}) => {
  const { addResolution, users } = useApp();

  const [title, setTitle] = useState('');
  const [resolutionNumber, setResolutionNumber] = useState(`RES-1405-0${Math.floor(Math.random() * 90) + 10}`);
  const [date, setDate] = useState('۱۴۰۵/۰۲/۱۵');
  const [meetingNumber, setMeetingNumber] = useState('جلسه شماره ۱۲ هیئت مدیره');
  const [content, setContent] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState(users[0]?.id || '');
  const [executionDeadline, setExecutionDeadline] = useState('۱۴۰۵/۰۳/۰۱');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    addResolution({
      resolutionNumber: resolutionNumber.trim(),
      date: date.trim(),
      meetingNumber: meetingNumber.trim(),
      title: title.trim(),
      content: content.trim(),
      responsibleUserId: responsibleUserId || undefined,
      executionDeadline: executionDeadline.trim() || undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-r from-slate-900 to-amber-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">ثبت مصوبه هیئت مدیره و مدیریت</h2>
              <p className="text-xs text-amber-200">ثبت رسمی تصمیمات هیئت مدیره، مجامع و دستورات سازمانی</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                شماره مصوبه
              </label>
              <input
                type="text"
                required
                value={resolutionNumber}
                onChange={(e) => setResolutionNumber(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تاریخ تصویب
              </label>
              <input
                type="text"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                شماره / عنوان جلسه
              </label>
              <input
                type="text"
                required
                value={meetingNumber}
                onChange={(e) => setMeetingNumber(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عنوان مصوبه <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تصویب بودجه توسعه زیرساخت و مهاجرت ابری"
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              متن کامل و مشروح مصوبه <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="متن تصمیم هیئت مدیره و جزئیات اجرایی..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 leading-relaxed font-sans"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                مسئول پیگیری و اجرای مصوبه
              </label>
              <select
                value={responsibleUserId}
                onChange={(e) => setResponsibleUserId(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                مهلت اجرای نهایی
              </label>
              <input
                type="text"
                value={executionDeadline}
                onChange={(e) => setExecutionDeadline(e.target.value)}
                placeholder="۱۴۰۵/۰۳/۰۱"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

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
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ثبت مصوبه</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
