import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  Send, 
  Archive, 
  Award, 
  SlidersHorizontal, 
  Layers, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Folder 
} from 'lucide-react';
import { SecretariatLetter, LetterType, LetterUrgency, LetterClassification } from '../../types';
import { useApp } from '../../context/AppContext';
import { LetterRow } from './LetterRow';
import { LetterDetailsModal } from './LetterDetailsModal';
import { CreateLetterModal } from './CreateLetterModal';
import { LetterReferralModal } from './LetterReferralModal';
import { LetterReplyModal } from './LetterReplyModal';
import { LetterArchiveModal } from './LetterArchiveModal';
import { ResolutionsTab } from './ResolutionsTab';
import { CreateResolutionModal } from './CreateResolutionModal';
import { ArchiveDossiersTab } from './ArchiveDossiersTab';
import { CreateDossierModal } from './CreateDossierModal';

export const SecretariatMainView: React.FC = () => {
  const { 
    secretariatLetters, 
    secretariatResolutions, 
    archiveDossiers, 
    currentUser, 
    hasPermission 
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    'all' | 'incoming' | 'outgoing' | 'internal' | 'my_referrals' | 'resolutions' | 'archive'
  >('all');

  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');

  // Modals state
  const [isCreateLetterOpen, setIsCreateLetterOpen] = useState(false);
  const [createLetterType, setCreateLetterType] = useState<LetterType>('incoming');

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeLetterForDetails, setActiveLetterForDetails] = useState<SecretariatLetter | null>(null);

  const [isReferralOpen, setIsReferralOpen] = useState(false);
  const [activeLetterForReferral, setActiveLetterForReferral] = useState<SecretariatLetter | null>(null);

  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [activeLetterForReply, setActiveLetterForReply] = useState<SecretariatLetter | null>(null);

  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [activeLetterForArchive, setActiveLetterForArchive] = useState<SecretariatLetter | null>(null);

  const [isCreateResolutionOpen, setIsCreateResolutionOpen] = useState(false);
  const [isCreateDossierOpen, setIsCreateDossierOpen] = useState(false);

  // Statistics calculation
  const totalLetters = secretariatLetters.length;
  const incomingCount = secretariatLetters.filter(l => l.type === 'incoming').length;
  const outgoingCount = secretariatLetters.filter(l => l.type === 'outgoing').length;
  const internalCount = secretariatLetters.filter(l => l.type === 'internal').length;
  
  const myReferralsCount = secretariatLetters.filter(l => 
    l.referrals?.some(r => r.toUserId === currentUser.id && r.status !== 'completed')
  ).length;

  const resolutionsCount = secretariatResolutions.length;
  const archiveDossiersCount = archiveDossiers.length;

  // Filter letters
  const filteredLetters = secretariatLetters.filter(letter => {
    // Tab filter
    if (activeTab === 'incoming' && letter.type !== 'incoming') return false;
    if (activeTab === 'outgoing' && letter.type !== 'outgoing') return false;
    if (activeTab === 'internal' && letter.type !== 'internal') return false;
    if (activeTab === 'my_referrals') {
      const hasMyRef = letter.referrals?.some(r => r.toUserId === currentUser.id);
      if (!hasMyRef) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSubject = letter.subject.toLowerCase().includes(q);
      const matchNum = letter.letterNumber.toLowerCase().includes(q);
      const matchSender = letter.sender.toLowerCase().includes(q);
      const matchRecipient = letter.recipient.toLowerCase().includes(q);
      const matchContent = letter.content.toLowerCase().includes(q);
      if (!matchSubject && !matchNum && !matchSender && !matchRecipient && !matchContent) return false;
    }

    // Urgency filter
    if (urgencyFilter !== 'all' && letter.urgency !== urgencyFilter) return false;

    // Classification filter
    if (classificationFilter !== 'all' && letter.classification !== classificationFilter) return false;

    return true;
  });

  const handleOpenDetails = (letter: SecretariatLetter) => {
    setActiveLetterForDetails(letter);
    setIsDetailsOpen(true);
  };

  const handleOpenReferral = (letter: SecretariatLetter) => {
    setActiveLetterForReferral(letter);
    setIsReferralOpen(true);
  };

  const handleOpenReply = (letter: SecretariatLetter) => {
    setActiveLetterForReply(letter);
    setIsReplyOpen(true);
  };

  const handleOpenArchive = (letter: SecretariatLetter) => {
    setActiveLetterForArchive(letter);
    setIsArchiveOpen(true);
  };

  const handleOpenCreateWith = (t: LetterType) => {
    setCreateLetterType(t);
    setIsCreateLetterOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Banner */}
      <div className="bg-gradient-to-l from-slate-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
              <FileText className="w-3.5 h-3.5" />
              <span>سامانه اتوماسیون اداری و دبیرخانه مرکزی</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              دبیرخانه و گردش مکاتبات رسمی تدبیر
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              ثبت و صدور نامه‌های وارده و صادره، گردش کار و ارجاع مکاتبات، رصد مصوبات هیئت مدیره و بایگانی الکترونیک اسناد سازمانی.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasPermission('secretariat_create') && (
              <>
                <button
                  onClick={() => handleOpenCreateWith('incoming')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>ثبت نامه وارده</span>
                </button>

                <button
                  onClick={() => handleOpenCreateWith('outgoing')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>صدور نامه صادره</span>
                </button>

                <button
                  onClick={() => handleOpenCreateWith('internal')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>مکاتبه داخلی</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-slate-400 text-[11px] font-medium">کل مکاتبات</div>
            <div className="text-xl font-bold font-mono text-white mt-0.5">{totalLetters}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-emerald-300 text-[11px] font-medium">نامه‌های وارده</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{incomingCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-blue-300 text-[11px] font-medium">نامه‌های صادره</div>
            <div className="text-xl font-bold font-mono text-blue-400 mt-0.5">{outgoingCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-purple-300 text-[11px] font-medium">ارجاعات من</div>
            <div className="text-xl font-bold font-mono text-purple-400 mt-0.5">{myReferralsCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-amber-300 text-[11px] font-medium">مصوبات سازمانی</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{resolutionsCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-teal-300 text-[11px] font-medium">پرونده‌های بایگانی</div>
            <div className="text-xl font-bold font-mono text-teal-400 mt-0.5">{archiveDossiersCount}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>همه مکاتبات ({totalLetters})</span>
          </button>

          <button
            onClick={() => setActiveTab('incoming')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'incoming'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            <span>وارده ({incomingCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('outgoing')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'outgoing'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
            <span>صادره ({outgoingCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('internal')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'internal'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
            <span>داخلی ({internalCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('my_referrals')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'my_referrals'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Send className="w-3.5 h-3.5 rotate-180 text-indigo-300" />
            <span>ارجاعات من ({myReferralsCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('resolutions')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'resolutions'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>مصوبات ({resolutionsCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('archive')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'archive'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-teal-300" />
            <span>بایگانی اسناد ({archiveDossiersCount})</span>
          </button>
        </div>

        {activeTab !== 'resolutions' && activeTab !== 'archive' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="شماره نامه، موضوع، فرستنده..."
              className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Main View Switching */}
      {activeTab === 'resolutions' ? (
        <ResolutionsTab onOpenCreateModal={() => setIsCreateResolutionOpen(true)} />
      ) : activeTab === 'archive' ? (
        <ArchiveDossiersTab
          onOpenCreateDossier={() => setIsCreateDossierOpen(true)}
          onOpenLetterDetails={handleOpenDetails}
        />
      ) : (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>فیلترها:</span>
              </div>

              {/* Urgency */}
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium"
              >
                <option value="all">همه فوریت‌ها</option>
                <option value="immediate">آنی و بسیار فوری</option>
                <option value="urgent">فوری</option>
                <option value="normal">عادی</option>
              </select>

              {/* Classification */}
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-medium"
              >
                <option value="all">همه طبقه‌بندی‌ها</option>
                <option value="top_secret">بکلی سری</option>
                <option value="secret">سری</option>
                <option value="confidential">محرمانه</option>
                <option value="normal">عادی</option>
              </select>
            </div>

            <div className="text-xs text-slate-500">
              نمایش <span className="font-bold text-slate-800">{filteredLetters.length}</span> نامه اداری
            </div>
          </div>

          {/* Letters Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <th className="py-3 px-4">نوع و شماره نامه</th>
                    <th className="py-3 px-4">تاریخ ثبت</th>
                    <th className="py-3 px-4">موضوع و طرف مکاتبه</th>
                    <th className="py-3 px-4">فوریت و طبقه‌بندی</th>
                    <th className="py-3 px-4">وضعیت گردش</th>
                    <th className="py-3 px-4 text-left">عملیات سریع</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLetters.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                        نامه‌ای با این مشخصات در دبیرخانه یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    filteredLetters.map(letter => (
                      <LetterRow
                        key={letter.id}
                        letter={letter}
                        onOpenDetails={handleOpenDetails}
                        onOpenReferral={handleOpenReferral}
                        onOpenReply={handleOpenReply}
                        onOpenArchive={handleOpenArchive}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {isCreateLetterOpen && (
        <CreateLetterModal
          isOpen={isCreateLetterOpen}
          onClose={() => setIsCreateLetterOpen(false)}
          defaultType={createLetterType}
        />
      )}

      {isDetailsOpen && activeLetterForDetails && (
        <LetterDetailsModal
          letterId={activeLetterForDetails.id}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setActiveLetterForDetails(null);
          }}
          onOpenReferral={handleOpenReferral}
          onOpenReply={handleOpenReply}
          onOpenArchive={handleOpenArchive}
        />
      )}

      {isReferralOpen && activeLetterForReferral && (
        <LetterReferralModal
          letter={activeLetterForReferral}
          isOpen={isReferralOpen}
          onClose={() => {
            setIsReferralOpen(false);
            setActiveLetterForReferral(null);
          }}
        />
      )}

      {isReplyOpen && activeLetterForReply && (
        <LetterReplyModal
          originalLetter={activeLetterForReply}
          isOpen={isReplyOpen}
          onClose={() => {
            setIsReplyOpen(false);
            setActiveLetterForReply(null);
          }}
        />
      )}

      {isArchiveOpen && activeLetterForArchive && (
        <LetterArchiveModal
          letter={activeLetterForArchive}
          isOpen={isArchiveOpen}
          onClose={() => {
            setIsArchiveOpen(false);
            setActiveLetterForArchive(null);
          }}
        />
      )}

      {isCreateResolutionOpen && (
        <CreateResolutionModal
          isOpen={isCreateResolutionOpen}
          onClose={() => setIsCreateResolutionOpen(false)}
        />
      )}

      {isCreateDossierOpen && (
        <CreateDossierModal
          isOpen={isCreateDossierOpen}
          onClose={() => setIsCreateDossierOpen(false)}
        />
      )}
    </div>
  );
};
