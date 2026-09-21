import React, { useState } from 'react';
import { 
  X, 
  FileText, 
  Send, 
  CornerUpLeft, 
  Archive, 
  CheckSquare, 
  CheckCircle2, 
  Clock, 
  Building, 
  User, 
  ShieldAlert, 
  Paperclip, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  Printer, 
  Share2, 
  History, 
  ExternalLink,
  Plus
} from 'lucide-react';
import { SecretariatLetter, LetterStatus, ReferralActionType } from '../../types';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';

interface LetterDetailsModalProps {
  letterId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenReferral: (letter: SecretariatLetter) => void;
  onOpenReply: (letter: SecretariatLetter) => void;
  onOpenArchive: (letter: SecretariatLetter) => void;
}

export const LetterDetailsModal: React.FC<LetterDetailsModalProps> = ({
  letterId,
  isOpen,
  onClose,
  onOpenReferral,
  onOpenReply,
  onOpenArchive
}) => {
  const { 
    secretariatLetters, 
    users, 
    projects, 
    assets,
    updateLetter, 
    updateReferralStatus, 
    convertReferralToTask, 
    hasPermission,
    currentUser 
  } = useApp();

  const [activeTab, setActiveTab] = useState<'content' | 'referrals' | 'workflow' | 'attachments'>('content');
  const [selectedProjectIdForTask, setSelectedProjectIdForTask] = useState<string>(projects[0]?.id || '');
  const [referralNotesInput, setReferralNotesInput] = useState<Record<string, string>>({});

  const letter = secretariatLetters.find(l => l.id === letterId);

  if (!isOpen || !letter) return null;

  const relatedLetter = letter.relatedLetterId 
    ? secretariatLetters.find(l => l.id === letter.relatedLetterId) 
    : null;

  const letterAttachments = assets.filter(a => letter.assetIds?.includes(a.id));

  const handleStatusChange = (status: LetterStatus) => {
    updateLetter(letter.id, { status });
  };

  const actionLabels: Record<ReferralActionType, string> = {
    review: 'بررسی و اظهار نظر',
    action: 'اقدام لازم',
    response: 'تهیه پاسخ رسمی',
    info: 'جهت استحضار و اطلاع',
    followup: 'پیگیری مستمر'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-white/15 text-indigo-200 rounded">
                  {letter.letterNumber}
                </span>
                <span className="text-xs text-slate-300">
                  تاریخ: {letter.letterDate}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white mt-0.5 line-clamp-1">
                {letter.subject}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="چاپ نامه رسمی"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 border-b border-slate-200 bg-slate-50 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('content')}
              className={`py-3 px-3 border-b-2 font-bold transition-all ${
                activeTab === 'content'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              متن و مشخصات نامه
            </button>

            <button
              onClick={() => setActiveTab('referrals')}
              className={`py-3 px-3 border-b-2 font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'referrals'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>گردش و ارجاعات سازمانی</span>
              <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                {letter.referrals?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('workflow')}
              className={`py-3 px-3 border-b-2 font-bold transition-all ${
                activeTab === 'workflow'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              تاریخچه رویدادها (Audit Log)
            </button>

            <button
              onClick={() => setActiveTab('attachments')}
              className={`py-3 px-3 border-b-2 font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'attachments'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>پیوست‌ها و اسناد (DAM)</span>
              <span className="bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                {letter.assetIds?.length || 0}
              </span>
            </button>
          </div>

          {/* Quick status selector */}
          <div className="flex items-center gap-2 py-2">
            <span className="text-slate-500 font-medium">وضعیت:</span>
            <select
              value={letter.status}
              onChange={(e) => handleStatusChange(e.target.value as LetterStatus)}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="draft">پیش‌نویس</option>
              <option value="registered">ثبت اولیه</option>
              <option value="referred">ارجاع شده</option>
              <option value="in_progress">در دست اقدام</option>
              <option value="answered">پاسخ داده شد</option>
              <option value="archived">بایگانی شده</option>
            </select>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          {/* Tab: Content */}
          {activeTab === 'content' && (
            <div className="space-y-5">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">فرستنده:</span>
                  <span className="font-bold text-slate-800">{letter.sender}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">گیرنده اصلی:</span>
                  <span className="font-bold text-slate-800">{letter.recipient}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">طبقه‌بندی امنیتی:</span>
                  <span className="font-bold text-slate-800">
                    {letter.classification === 'top_secret' ? 'بکلی سری' : letter.classification === 'secret' ? 'سری' : letter.classification === 'confidential' ? 'محرمانه' : 'عادی'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">فوریت نامه:</span>
                  <span className="font-bold text-slate-800">
                    {letter.urgency === 'immediate' ? 'آنی و فوری' : letter.urgency === 'urgent' ? 'فوری' : 'عادی'}
                  </span>
                </div>

                {letter.indicatNumber && (
                  <div>
                    <span className="text-slate-400 block mb-1">شماره اندیکاتور:</span>
                    <span className="font-mono font-bold text-slate-800">{letter.indicatNumber}</span>
                  </div>
                )}

                {letter.responseDeadline && (
                  <div>
                    <span className="text-slate-400 block mb-1">مهلت پاسخ:</span>
                    <span className="font-mono font-bold text-amber-700">{letter.responseDeadline}</span>
                  </div>
                )}

                {letter.archiveBox && (
                  <div>
                    <span className="text-slate-400 block mb-1">محل قفسه / زونکن:</span>
                    <span className="font-bold text-slate-800">{letter.archiveBox}</span>
                  </div>
                )}

                {letter.ccList && letter.ccList.length > 0 && (
                  <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200">
                    <span className="text-slate-400 block mb-1">رونوشت به (CC):</span>
                    <span className="text-slate-700">{letter.ccList.join(' | ')}</span>
                  </div>
                )}
              </div>

              {/* Related Letter Link (if reply) */}
              {relatedLetter && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                  <div className="flex items-center gap-2">
                    <CornerUpLeft className="w-4 h-4 text-blue-600" />
                    <span>عطف / پیرو نامه شماره <strong>{relatedLetter.letterNumber}</strong> با موضوع «{relatedLetter.subject}»</span>
                  </div>
                </div>
              )}

              {/* Official Letter Canvas View */}
              <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-300/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs text-slate-500">
                  <span>سامانه مکاتبات اداری و دبیرخانه تدبیر</span>
                  <span>بسمه تعالی</span>
                  <span>پیوست: {letter.assetIds?.length ? `${letter.assetIds.length} برگ` : 'ندارد'}</span>
                </div>

                <div className="py-2">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 mb-4">
                    موضوع: {letter.subject}
                  </h3>

                  <div className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line min-h-[140px] font-sans">
                    {letter.content}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-between items-end text-xs text-slate-600">
                  <div>
                    {letter.tags && letter.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {letter.tags.map((tag, idx) => (
                          <span key={idx} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-500">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-800">{letter.sender}</div>
                    <div className="text-[11px] text-slate-400">{letter.letterDate}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Referrals */}
          {activeTab === 'referrals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-indigo-600 rotate-180" />
                  ارجاعات و دستورات پیگیری نامه
                </h3>
                <button
                  onClick={() => onOpenReferral(letter)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  ارجاع جدید
                </button>
              </div>

              {letter.referrals?.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs">
                  تاکنون هیچ ارجاعی برای این نامه ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-3">
                  {letter.referrals.map((ref) => {
                    const fromUser = users.find(u => u.id === ref.fromUserId);
                    const toUser = users.find(u => u.id === ref.toUserId);

                    return (
                      <div key={ref.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-start justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            {fromUser && <Avatar user={fromUser} size="xs" />}
                            <span className="font-bold text-slate-800">{fromUser?.name}</span>
                            <span className="text-slate-400">به</span>
                            {toUser && <Avatar user={toUser} size="xs" />}
                            <span className="font-bold text-slate-800">{toUser?.name || ref.department || 'واحد سازمانی'}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800">
                              {actionLabels[ref.actionType]}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">{ref.timestamp}</span>
                          </div>
                        </div>

                        {/* Instructions */}
                        <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-800 leading-relaxed">
                          <span className="font-bold text-slate-500 block mb-1 text-[11px]">دستور ارجاع:</span>
                          {ref.instructions}
                        </div>

                        {/* Deadline & Convert to Task */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                          <div className="flex items-center gap-3 text-slate-500">
                            {ref.deadline && (
                              <span className="flex items-center gap-1 text-amber-700 font-medium">
                                <Clock className="w-3.5 h-3.5" />
                                مهلت اقدام: {ref.deadline}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {ref.convertedTaskId ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                تبدیل به تسک شد
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={selectedProjectIdForTask}
                                  onChange={(e) => setSelectedProjectIdForTask(e.target.value)}
                                  className="text-xs px-2 py-1 rounded border border-slate-300 bg-white"
                                >
                                  {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => convertReferralToTask(letter.id, ref.id, selectedProjectIdForTask)}
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                                >
                                  <CheckSquare className="w-3.5 h-3.5" />
                                  تبدیل به Task
                                </button>
                              </div>
                            )}

                            {/* Status Changer */}
                            <select
                              value={ref.status}
                              onChange={(e) => updateReferralStatus(letter.id, ref.id, e.target.value as any)}
                              className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                                ref.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : ref.status === 'in_progress'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              <option value="pending">در انتظار اقدام</option>
                              <option value="in_progress">در دست بررسی</option>
                              <option value="completed">اقدام شد / خاتمه</option>
                              <option value="rejected">رد شد / عدم اقدام</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab: Workflow Audit Log */}
          {activeTab === 'workflow' && (
            <div className="space-y-3">
              {letter.workflow?.map((step) => {
                const user = users.find(u => u.id === step.userId);
                return (
                  <div key={step.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3 text-xs">
                    {user && <Avatar user={user} size="sm" />}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-800">{user?.name} - {step.stageName}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{step.timestamp}</span>
                      </div>
                      <p className="text-slate-700">{step.action}</p>
                      {step.notes && (
                        <p className="mt-1 text-slate-500 bg-white p-2 rounded border border-slate-100 text-[11px]">
                          {step.notes}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab: Attachments */}
          {activeTab === 'attachments' && (
            <div className="space-y-4">
              {letterAttachments.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs">
                  هیچ فایلی از سامانه مدیریت دارایی‌ها (DAM) به این نامه پیوست نشده است.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {letterAttachments.map((asset) => (
                    <div key={asset.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Paperclip className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 truncate">{asset.name}</div>
                          <div className="text-[11px] text-slate-400">{asset.size} | نسخه {asset.version}</div>
                        </div>
                      </div>

                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg shrink-0"
                        title="مشاهده / دانلود"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {letter.status !== 'archived' && (
              <button
                onClick={() => onOpenArchive(letter)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs"
              >
                <Archive className="w-4 h-4 text-emerald-600" />
                بایگانی در پرونده
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {letter.type === 'incoming' && (
              <button
                onClick={() => onOpenReply(letter)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
              >
                <CornerUpLeft className="w-4 h-4" />
                تهیه پاسخ رسمی
              </button>
            )}

            <button
              onClick={() => onOpenReferral(letter)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-colors"
            >
              <Send className="w-4 h-4 rotate-180" />
              ارجاع به کارشناس
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
