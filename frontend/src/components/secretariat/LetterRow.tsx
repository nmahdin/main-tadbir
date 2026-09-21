import React from 'react';
import { 
  FileText, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  Send, 
  Clock, 
  AlertCircle, 
  ShieldAlert, 
  Paperclip, 
  CheckCircle2, 
  CornerUpLeft, 
  Archive, 
  Eye, 
  Trash2,
  Share2,
  CheckSquare
} from 'lucide-react';
import { SecretariatLetter, LetterType, LetterUrgency, LetterClassification, LetterStatus } from '../../types';
import { useApp } from '../../context/AppContext';

interface LetterRowProps {
  letter: SecretariatLetter;
  onOpenDetails: (letter: SecretariatLetter) => void;
  onOpenReferral: (letter: SecretariatLetter) => void;
  onOpenReply: (letter: SecretariatLetter) => void;
  onOpenArchive: (letter: SecretariatLetter) => void;
}

export const LetterRow: React.FC<LetterRowProps> = ({
  letter,
  onOpenDetails,
  onOpenReferral,
  onOpenReply,
  onOpenArchive
}) => {
  const { deleteLetter, hasPermission, currentUser } = useApp();

  const getTypeBadge = (type: LetterType) => {
    switch (type) {
      case 'incoming':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
            وارده
          </span>
        );
      case 'outgoing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <ArrowUpRight className="w-3 h-3 text-blue-600" />
            صادره
          </span>
        );
      case 'internal':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <RefreshCw className="w-3 h-3 text-purple-600" />
            داخلی
          </span>
        );
    }
  };

  const getUrgencyBadge = (urgency: LetterUrgency) => {
    switch (urgency) {
      case 'immediate':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 animate-pulse">آنی و فوری</span>;
      case 'urgent':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">فوری</span>;
      case 'normal':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">عادی</span>;
    }
  };

  const getClassificationBadge = (cls: LetterClassification) => {
    switch (cls) {
      case 'top_secret':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-900 text-white flex items-center gap-1"><ShieldAlert className="w-3 h-3" />بکلی سری</span>;
      case 'secret':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />سری</span>;
      case 'confidential':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-900">محرمانه</span>;
      case 'normal':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">عادی</span>;
    }
  };

  const getStatusBadge = (status: LetterStatus) => {
    switch (status) {
      case 'draft':
        return <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">پیش‌نویس</span>;
      case 'registered':
        return <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">ثبت اولیه</span>;
      case 'referred':
        return <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">ارجاع شده</span>;
      case 'in_progress':
        return <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">در دست اقدام</span>;
      case 'answered':
        return <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">پاسخ داده شد</span>;
      case 'archived':
        return <span className="text-xs font-medium text-slate-700 bg-slate-200 px-2 py-0.5 rounded">بایگانی شده</span>;
    }
  };

  return (
    <tr 
      onClick={() => onOpenDetails(letter)}
      className="hover:bg-slate-50/80 transition-colors border-b border-slate-200/80 cursor-pointer group"
    >
      {/* Letter Number & Type */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2">
          {getTypeBadge(letter.type)}
          <span className="font-mono text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
            {letter.letterNumber}
          </span>
        </div>
      </td>

      {/* Date */}
      <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
        {letter.letterDate}
      </td>

      {/* Subject & Summary */}
      <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
        <div className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">
          {letter.subject}
        </div>
        <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
          {letter.sender} ← {letter.recipient}
        </div>
      </td>

      {/* Urgency & Classification */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {getUrgencyBadge(letter.urgency)}
          {getClassificationBadge(letter.classification)}
        </div>
      </td>

      {/* Status */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2">
          {getStatusBadge(letter.status)}
          {letter.referrals?.length > 0 && (
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded" title="تعداد ارجاعات">
              {letter.referrals.length} ارجاع
            </span>
          )}
          {letter.assetIds?.length > 0 && (
            <Paperclip className="w-3.5 h-3.5 text-slate-400" title="دارای پیوست" />
          )}
        </div>
      </td>

      {/* Quick Action Buttons */}
      <td className="py-3.5 px-4 text-left" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
          {/* Refer button */}
          <button
            onClick={() => onOpenReferral(letter)}
            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="ارجاع به کارشناس / تیم"
          >
            <Send className="w-4 h-4 rotate-180" />
          </button>

          {/* Reply button */}
          {letter.type === 'incoming' && (
            <button
              onClick={() => onOpenReply(letter)}
              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="تهیه پاسخ رسمی"
            >
              <CornerUpLeft className="w-4 h-4" />
            </button>
          )}

          {/* Archive button */}
          {letter.status !== 'archived' && (
            <button
              onClick={() => onOpenArchive(letter)}
              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="بایگانی در پرونده اسناد"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}

          {/* Delete button */}
          {hasPermission('secretariat_delete') && (
            <button
              onClick={() => {
                if (confirm(`آیا از حذف نامه «${letter.letterNumber}» اطمینان دارید؟`)) {
                  deleteLetter(letter.id);
                }
              }}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="حذف نامه"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
