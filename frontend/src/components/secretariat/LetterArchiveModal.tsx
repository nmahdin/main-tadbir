import React, { useState } from 'react';
import { X, Archive, Folder, CheckCircle2 } from 'lucide-react';
import { SecretariatLetter } from '../../types';
import { useApp } from '../../context/AppContext';

interface LetterArchiveModalProps {
  letter: SecretariatLetter | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LetterArchiveModal: React.FC<LetterArchiveModalProps> = ({
  letter,
  isOpen,
  onClose
}) => {
  const { archiveLetter, archiveDossiers } = useApp();

  const [dossierId, setDossierId] = useState(archiveDossiers[0]?.id || '');
  const [boxLocation, setBoxLocation] = useState('زونکن الف-۱۲، قفسه ۴ دبیرخانه');

  if (!isOpen || !letter) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dossierId) return;
    archiveLetter(letter.id, dossierId, boxLocation.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-r from-teal-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">بایگانی اسناد اداری</h2>
              <p className="text-xs text-teal-200">نامه شماره {letter.letterNumber}</p>
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
              انتخاب پرونده بایگانی (Dossier) <span className="text-rose-500">*</span>
            </label>
            <select
              value={dossierId}
              onChange={(e) => setDossierId(e.target.value)}
              className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white"
            >
              {archiveDossiers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.code} - {d.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              محل فیزیکی بایگانی / شماره زونکن
            </label>
            <input
              type="text"
              value={boxLocation}
              onChange={(e) => setBoxLocation(e.target.value)}
              placeholder="مثال: بایگانی راکد، قفسه ۳، زونکن ۱۴۰۵"
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300"
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
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ثبت در بایگانی</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
