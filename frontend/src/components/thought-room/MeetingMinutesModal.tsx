import React, { useState } from 'react';
import { X, FileText, CheckCircle2, Plus, Trash2, CheckSquare, Calendar, User, ArrowRight } from 'lucide-react';
import { ThinkTankMeeting, MeetingActionItem } from '../../types';
import { useApp } from '../../context/AppContext';

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
  const { addMeetingMinutes, convertActionItemToTask, users, projects } = useApp();

  const [minutesSummary, setMinutesSummary] = useState(
    meeting?.minutesSummary || 'جلسه با حضور اعضا تشکیل و پس از بررسی طرح‌های پیشنهادی، نتایج و تصمیمات زیر مصوب گردید:'
  );

  const [decisions, setDecisions] = useState<string[]>(
    meeting?.decisions && meeting.decisions.length > 0
      ? meeting.decisions
      : ['تصویب کلیات طرح پیشنهادی با اعمال اصلاحات فنی', 'تخصیص بودجه اولیه برای اجرای آزمایشی فاز اول']
  );

  const [actionItems, setActionItems] = useState<MeetingActionItem[]>(
    meeting?.actionItems && meeting.actionItems.length > 0
      ? meeting.actionItems
      : [
          {
            id: `act-1`,
            title: 'تهیه پروپوزال فنی و معماری ماژول',
            assigneeId: users[0]?.id || '',
            deadline: '۱۴۰۵/۰۲/۲۵',
            status: 'pending'
          }
        ]
  );

  const [selectedConvertProjectId, setSelectedConvertProjectId] = useState(projects[0]?.id || '');

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
        deadline: '۱۴۰۵/۰۲/۳۰',
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    addMeetingMinutes(
      meeting.id,
      minutesSummary.trim(),
      decisions.filter(d => d.trim()),
      actionItems.filter(a => a.title.trim())
    );
    onClose();
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
              <p className="text-xs text-slate-300">جلسه: {meeting.title} ({meeting.date})</p>
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
                      <input
                        type="text"
                        value={item.deadline}
                        onChange={(e) => handleActionItemChange(idx, 'deadline', e.target.value)}
                        className="flex-1 text-xs px-2 py-1 rounded border border-slate-300"
                        placeholder="۱۴۰۵/۰۲/۲۵"
                      />
                    </div>
                  </div>
                </div>
              ))}
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
              <span>نهایی‌سازی و ثبت صورتجلسه</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
