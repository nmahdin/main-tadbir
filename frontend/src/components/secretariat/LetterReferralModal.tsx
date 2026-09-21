import React, { useState } from 'react';
import { X, Send, Clock, User, Building, CheckCircle2 } from 'lucide-react';
import { SecretariatLetter, ReferralActionType } from '../../types';
import { useApp } from '../../context/AppContext';

interface LetterReferralModalProps {
  letter: SecretariatLetter | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LetterReferralModal: React.FC<LetterReferralModalProps> = ({
  letter,
  isOpen,
  onClose
}) => {
  const { referLetter, users, teams } = useApp();

  const [toUserId, setToUserId] = useState<string>(users[0]?.id || '');
  const [toTeamId, setToTeamId] = useState<string>('');
  const [department, setDepartment] = useState('واحد مهندسی و فنی');
  const [actionType, setActionType] = useState<ReferralActionType>('action');
  const [instructions, setInstructions] = useState('جناب مهندس، لطفاً موضوع نامه فوق را بررسی و اقدام لازم معمول فرمایید.');
  const [deadline, setDeadline] = useState('۱۴۰۵/۰۲/۲۰');

  if (!isOpen || !letter) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructions.trim()) return;

    referLetter(letter.id, {
      toUserId: toUserId || undefined,
      toTeamId: toTeamId || undefined,
      department: department.trim(),
      actionType,
      instructions: instructions.trim(),
      deadline: deadline.trim()
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Send className="w-5 h-5 rotate-180" />
            </div>
            <div>
              <h2 className="text-base font-bold">ارجاع نامه اداری</h2>
              <p className="text-xs text-indigo-200">نامه: {letter.letterNumber} - {letter.subject}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ارجاع به کاربر / کارشناس
              </label>
              <select
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">-- انتخاب کارشناس --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ارجاع به تیم / دپارتمان
              </label>
              <select
                value={toTeamId}
                onChange={(e) => setToTeamId(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">-- انتخاب تیم --</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع اقدام مورد انتظار
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ReferralActionType)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-indigo-900"
              >
                <option value="action">اقدام لازم</option>
                <option value="review">بررسی و اظهار نظر کارشناسی</option>
                <option value="response">تهیه و تنظیم پاسخ رسمی</option>
                <option value="info">جهت استحضار و اطلاع</option>
                <option value="followup">پیگیری مستمر تا حصول نتیجه</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                مهلت انجام اقدام
              </label>
              <input
                type="text"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="۱۴۰۵/۰۲/۲۰"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              دستور و یادداشت ارجاع <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="دستور مشخص برای ارجاع‌شونده..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
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
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5"
            >
              <Send className="w-4 h-4 rotate-180" />
              <span>ثبت و ابلاغ ارجاع</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
