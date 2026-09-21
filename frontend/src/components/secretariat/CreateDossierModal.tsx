import React, { useState } from 'react';
import { X, Folder, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface CreateDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateDossierModal: React.FC<CreateDossierModalProps> = ({
  isOpen,
  onClose
}) => {
  const { addArchiveDossier } = useApp();

  const [code, setCode] = useState(`DOS-1405-0${Math.floor(Math.random() * 90) + 10}`);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('قراردادها و پیمان‌ها');
  const [department, setDepartment] = useState('واحد حقوقی و قراردادها');
  const [physicalLocation, setPhysicalLocation] = useState('بایگانی مرکزی - قفسه ۴');
  const [retentionPeriod, setRetentionPeriod] = useState('۱۰ سال (دائمی)');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !code.trim()) return;

    addArchiveDossier({
      code: code.trim(),
      title: title.trim(),
      category: category.trim(),
      department: department.trim(),
      physicalLocation: physicalLocation.trim(),
      retentionPeriod: retentionPeriod.trim()
    });

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
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">ایجاد پرونده بایگانی اسناد</h2>
              <p className="text-xs text-teal-200">طبقه‌بندی و کدگذاری پرونده‌های راکد و جاری</p>
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
              کد پرونده بایگانی <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عنوان پرونده <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: پرونده قراردادهای پیمانکاری سال ۱۴۰۵"
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                دسته‌بندی موضوعی
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                واحد متولی
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                محل فیزیکی بایگانی
              </label>
              <input
                type="text"
                value={physicalLocation}
                onChange={(e) => setPhysicalLocation(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                مدت ماندگاری سند
              </label>
              <input
                type="text"
                value={retentionPeriod}
                onChange={(e) => setRetentionPeriod(e.target.value)}
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
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ایجاد پرونده</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
