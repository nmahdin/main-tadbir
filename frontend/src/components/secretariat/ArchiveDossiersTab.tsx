import React, { useState } from 'react';
import { 
  Archive, 
  Folder, 
  Plus, 
  Search, 
  FileText, 
  MapPin, 
  Clock, 
  Building, 
  Lock, 
  CheckCircle2, 
  Trash2,
  ExternalLink
} from 'lucide-react';
import { ArchiveDossier, SecretariatLetter } from '../../types';
import { useApp } from '../../context/AppContext';

interface ArchiveDossiersTabProps {
  onOpenCreateDossier: () => void;
  onOpenLetterDetails: (letter: SecretariatLetter) => void;
}

export const ArchiveDossiersTab: React.FC<ArchiveDossiersTabProps> = ({
  onOpenCreateDossier,
  onOpenLetterDetails
}) => {
  const { 
    archiveDossiers, 
    secretariatLetters, 
    deleteArchiveDossier, 
    hasPermission 
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(archiveDossiers[0]?.id || null);

  const filteredDossiers = archiveDossiers.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      d.department.toLowerCase().includes(q)
    );
  });

  const activeDossier = archiveDossiers.find(d => d.id === selectedDossierId);
  const dossierLetters = secretariatLetters.filter(l => l.archiveDossierId === selectedDossierId);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-teal-950 text-white p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-teal-300 text-xs font-bold">
            <Archive className="w-4 h-4" />
            <span>بایگانی اسناد و پرونده‌های راکد / جاری</span>
          </div>
          <h2 className="text-lg font-bold">مدیریت پرونده‌های اسناد و امحای سازمانی</h2>
          <p className="text-xs text-slate-300 mt-1">
            کدگذاری استاندارد، مدیریت محل استقرار فیزیکی زونکن‌ها و جستجوی سریع در اسناد بایگانی‌شده
          </p>
        </div>

        {hasPermission('secretariat_create') && (
          <button
            onClick={onOpenCreateDossier}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-md transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>ایجاد پرونده بایگانی جدید</span>
          </button>
        )}
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Main Column: Dossier List */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در پرونده‌ها..."
              className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            {filteredDossiers.map((dossier) => {
              const isSelected = selectedDossierId === dossier.id;
              const count = secretariatLetters.filter(l => l.archiveDossierId === dossier.id).length;

              return (
                <div
                  key={dossier.id}
                  onClick={() => setSelectedDossierId(dossier.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-teal-50 border-teal-500 shadow-xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-teal-800 bg-white px-2 py-0.5 rounded border border-teal-200">
                      {dossier.code}
                    </span>
                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      {count} سند
                    </span>
                  </div>

                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-1">{dossier.title}</h4>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                    <span>{dossier.department}</span>
                    <span>{dossier.category}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Dossier Details & Documents */}
        <div className="lg:col-span-2 space-y-4">
          {activeDossier ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
              {/* Dossier Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 px-2.5 py-1 rounded border border-teal-200">
                      {activeDossier.code}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      activeDossier.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {activeDossier.status === 'open' ? 'پرونده باز و جاری' : 'پرونده مختومه / راکد'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{activeDossier.title}</h3>
                </div>

                {hasPermission('secretariat_delete') && (
                  <button
                    onClick={() => {
                      if (confirm(`آیا از حذف پرونده بایگانی «${activeDossier.title}» اطمینان دارید؟`)) {
                        deleteArchiveDossier(activeDossier.id);
                        setSelectedDossierId(null);
                      }
                    }}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف پرونده</span>
                  </button>
                )}
              </div>

              {/* Dossier Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">دسته‌بندی:</span>
                  <span className="font-bold text-slate-800">{activeDossier.category}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">واحد سازمانی:</span>
                  <span className="font-bold text-slate-800">{activeDossier.department}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">محل فیزیکی:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-teal-600" />
                    {activeDossier.physicalLocation}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">مدت ماندگاری:</span>
                  <span className="font-bold text-slate-800">{activeDossier.retentionPeriod}</span>
                </div>
              </div>

              {/* Documents in Dossier */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-teal-600" />
                  اسناد و نامه‌های بایگانی‌شده در این پرونده ({dossierLetters.length})
                </h4>

                {dossierLetters.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs">
                    هنوز هیچ نامه‌ای به این پرونده منتقل نشده است.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dossierLetters.map(letter => (
                      <div
                        key={letter.id}
                        onClick={() => onOpenLetterDetails(letter)}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-teal-50/60 hover:border-teal-300 transition-colors cursor-pointer flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-800">{letter.letterNumber}</span>
                          <span className="text-slate-400">|</span>
                          <span className="font-bold text-slate-800">{letter.subject}</span>
                        </div>

                        <div className="flex items-center gap-3 text-slate-500 shrink-0">
                          <span>{letter.letterDate}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
              لطفاً یک پرونده را از ستون کناری انتخاب کنید.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
