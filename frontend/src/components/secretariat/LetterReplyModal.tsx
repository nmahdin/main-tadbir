import React, { useState } from 'react';
import { X, CornerUpLeft, Send, CheckCircle2, Paperclip } from 'lucide-react';
import { SecretariatLetter } from '../../types';
import { useApp } from '../../context/AppContext';

interface LetterReplyModalProps {
  originalLetter: SecretariatLetter | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LetterReplyModal: React.FC<LetterReplyModalProps> = ({
  originalLetter,
  isOpen,
  onClose
}) => {
  const { replyLetter, assets } = useApp();

  const [subject, setSubject] = useState(originalLetter ? `پاسخ به: ${originalLetter.subject}` : 'پاسخ نامه');
  const [recipient, setRecipient] = useState(originalLetter ? originalLetter.sender : '');
  const [content, setContent] = useState(
    originalLetter 
      ? `عطف به نامه شماره ${originalLetter.letterNumber} مورخ ${originalLetter.letterDate}، به استحضار می‌رساند:\n\n` 
      : ''
  );

  if (!isOpen || !originalLetter) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !content.trim() || !recipient.trim()) return;

    replyLetter(originalLetter.id, {
      subject: subject.trim(),
      recipient: recipient.trim(),
      content: content.trim()
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <CornerUpLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">تهیه و صدور پاسخ رسمی نامه</h2>
              <p className="text-xs text-blue-200">پاسخ به نامه وارده شماره {originalLetter.letterNumber}</p>
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
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              گیرنده پاسخ (شخص / سازمان) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              موضوع نامه صادره <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              متن رسمی پاسخ <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={6}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full text-xs sm:text-sm p-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans"
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
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span>صدور و ارسال نامه صادره</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
