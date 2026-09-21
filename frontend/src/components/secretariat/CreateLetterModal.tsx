import React, { useState } from 'react';
import { 
  X, 
  FileText, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  ShieldAlert, 
  Paperclip, 
  Plus, 
  Building, 
  CheckCircle2 
} from 'lucide-react';
import { LetterType, LetterUrgency, LetterClassification } from '../../types';
import { useApp } from '../../context/AppContext';

interface CreateLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: LetterType;
}

export const CreateLetterModal: React.FC<CreateLetterModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'incoming'
}) => {
  const { addLetter, users, assets } = useApp();

  const [type, setType] = useState<LetterType>(defaultType);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sender, setSender] = useState(defaultType === 'outgoing' ? 'شرکت مهندسی تدبیر' : 'وزارت امور اقتصادی و دارایی');
  const [recipient, setRecipient] = useState(defaultType === 'incoming' ? 'مدیرعامل و هیئت مدیره تدبیر' : 'سازمان فناوری اطلاعات');
  const [urgency, setUrgency] = useState<LetterUrgency>('normal');
  const [classification, setClassification] = useState<LetterClassification>('normal');
  const [indicatNumber, setIndicatNumber] = useState('');
  const [responseDeadline, setResponseDeadline] = useState('');
  const [ccListInput, setCcListInput] = useState('');
  const [tagsInput, setTagsInput] = useState('مکاتبات, رسمی');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: LetterType) => {
    setType(newType);
    if (newType === 'outgoing') {
      setSender('شرکت مهندسی تدبیر');
      setRecipient('');
    } else if (newType === 'incoming') {
      setSender('');
      setRecipient('شرکت مهندسی تدبیر');
    } else {
      setSender('مدیریت فناوری اطلاعات');
      setRecipient('معاونت منابع انسانی');
    }
  };

  const toggleAsset = (assetId: string) => {
    if (selectedAssetIds.includes(assetId)) {
      setSelectedAssetIds(selectedAssetIds.filter(id => id !== assetId));
    } else {
      setSelectedAssetIds([...selectedAssetIds, assetId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !content.trim() || !sender.trim() || !recipient.trim()) return;

    const ccList = ccListInput
      .split(/[,،]+/)
      .map(c => c.trim())
      .filter(Boolean);

    const tags = tagsInput
      .split(/[,،]+/)
      .map(t => t.trim())
      .filter(Boolean);

    addLetter({
      type,
      subject: subject.trim(),
      content: content.trim(),
      sender: sender.trim(),
      recipient: recipient.trim(),
      urgency,
      classification,
      indicatNumber: indicatNumber.trim() || undefined,
      responseDeadline: responseDeadline.trim() || undefined,
      ccList: ccList.length > 0 ? ccList : undefined,
      tags: tags.length > 0 ? tags : undefined,
      assetIds: selectedAssetIds
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">ثبت و صدور نامه در دبیرخانه</h2>
              <p className="text-xs text-slate-300">ثبت نامه وارده، صادره و مراودات اداری درون‌سازمانی</p>
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
          {/* Letter Type Selection Bar */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع نامه سازمانی</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('incoming')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  type === 'incoming'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                نامه وارده (دریافتی از خارج)
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('outgoing')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  type === 'outgoing'
                    ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-blue-600" />
                نامه صادره (ارسال به خارج)
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('internal')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  type === 'internal'
                    ? 'bg-purple-50 border-purple-500 text-purple-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <RefreshCw className="w-4 h-4 text-purple-600" />
                نامه داخلی (بین واحدها)
              </button>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              موضوع نامه <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثال: درخواست تأییدیه استقرار سرویس ابری سامانه تدبیر"
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Sender & Recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                فرستنده (شخص / سازمان / واحد) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                گیرنده اصلی (شخص / سازمان / واحد) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          {/* Urgency, Classification, Indicat */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                فوریت نامه
              </label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as LetterUrgency)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="normal">عادی</option>
                <option value="urgent">فوری</option>
                <option value="immediate">آنی و بسیار فوری</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                طبقه‌بندی امنیتی
              </label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as LetterClassification)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="normal">عادی</option>
                <option value="confidential">محرمانه</option>
                <option value="secret">سری</option>
                <option value="top_secret">بکلی سری</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                شماره اندیکاتور ثبت نامه
              </label>
              <input
                type="text"
                value={indicatNumber}
                onChange={(e) => setIndicatNumber(e.target.value)}
                placeholder="مثال: IND-1405-89"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>

          {/* Content Body */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              متن کامل نامه <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={5}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="متن مشروح نامه اداری را در این قسمت تایپ نمایید..."
              className="w-full text-xs sm:text-sm p-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 font-sans leading-relaxed"
            />
          </div>

          {/* Response Deadline & CC List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                مهلت اقدام یا پاسخ (در صورت نیاز)
              </label>
              <input
                type="text"
                value={responseDeadline}
                onChange={(e) => setResponseDeadline(e.target.value)}
                placeholder="۱۴۰۵/۰۲/۲۵"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                رونوشت به (CC)
              </label>
              <input
                type="text"
                value={ccListInput}
                onChange={(e) => setCcListInput(e.target.value)}
                placeholder="معاونت مالی، مدیریت منابع انسانی"
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          {/* DAM Asset Attachment selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              پیوست اسناد و فایل‌ها از مخزن دیجیتال (DAM)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {assets.map((asset) => {
                const isSelected = selectedAssetIds.includes(asset.id);
                return (
                  <div
                    key={asset.id}
                    onClick={() => toggleAsset(asset.id)}
                    className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${
                      isSelected ? 'border-indigo-500 bg-indigo-50 text-indigo-900 font-semibold' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span className="truncate">{asset.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">{asset.size}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Buttons */}
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
              <span>ثبت رسمی نامه در دبیرخانه</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
