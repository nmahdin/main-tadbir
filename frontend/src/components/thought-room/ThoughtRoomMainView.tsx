import React, { useState } from 'react';
import { 
  Lightbulb, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  TrendingUp, 
  FolderKanban, 
  CheckSquare, 
  BarChart2, 
  Sparkles, 
  CheckCircle2, 
  SlidersHorizontal,
  Layers,
  Building,
  Tag
} from 'lucide-react';
import { Idea, IdeaStatus, Priority, ThinkTankMeeting } from '../../types';
import { useApp } from '../../context/AppContext';
import { IdeaCard } from './IdeaCard';
import { IdeaDetailsModal } from './IdeaDetailsModal';
import { CreateIdeaModal } from './CreateIdeaModal';
import { ConvertToProjectModal } from './ConvertToProjectModal';
import { ConvertToTaskModal } from './ConvertToTaskModal';
import { ThinkTankMeetingsTab } from './ThinkTankMeetingsTab';
import { CreateMeetingModal } from './CreateMeetingModal';
import { MeetingMinutesModal } from './MeetingMinutesModal';

export const ThoughtRoomMainView: React.FC = () => {
  const { 
    ideas, 
    thinkTankMeetings, 
    selectedIdeaId, 
    setSelectedIdeaId,
    hasPermission 
  } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'under_review' | 'approved' | 'in_progress' | 'meetings'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Modals state
  const [isCreateIdeaOpen, setIsCreateIdeaOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [activeIdeaForDetails, setActiveIdeaForDetails] = useState<Idea | null>(null);

  const [isConvertToProjectOpen, setIsConvertToProjectOpen] = useState(false);
  const [isConvertToTaskOpen, setIsConvertToTaskOpen] = useState(false);
  const [targetIdeaForConversion, setTargetIdeaForConversion] = useState<Idea | null>(null);

  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState(false);
  const [isMinutesModalOpen, setIsMinutesModalOpen] = useState(false);
  const [activeMeetingForMinutes, setActiveMeetingForMinutes] = useState<ThinkTankMeeting | null>(null);

  // Department options
  const allDepartments = Array.from(new Set(ideas.map(i => i.targetDepartment).filter(Boolean)));
  // All unique tags
  const allTags = Array.from(new Set(ideas.flatMap(i => i.tags || [])));

  // Statistics
  const totalIdeasCount = ideas.length;
  const underReviewCount = ideas.filter(i => i.status === 'under_review' || i.status === 'submitted').length;
  const approvedCount = ideas.filter(i => i.status === 'approved').length;
  const convertedCount = ideas.filter(i => i.status === 'in_progress' || i.convertedProjectId || i.convertedTaskId).length;
  const meetingsCount = thinkTankMeetings.length;

  // Filter ideas
  const filteredIdeas = ideas.filter(idea => {
    // Tab filter
    if (activeTab === 'under_review' && idea.status !== 'under_review' && idea.status !== 'submitted') return false;
    if (activeTab === 'approved' && idea.status !== 'approved') return false;
    if (activeTab === 'in_progress' && idea.status !== 'in_progress' && idea.status !== 'completed') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = idea.title.toLowerCase().includes(q);
      const matchProblem = idea.problemSolved.toLowerCase().includes(q);
      const matchSolution = idea.proposedSolution.toLowerCase().includes(q);
      const matchCode = idea.code.toLowerCase().includes(q);
      if (!matchTitle && !matchProblem && !matchSolution && !matchCode) return false;
    }

    // Department filter
    if (departmentFilter !== 'all' && idea.targetDepartment !== departmentFilter) return false;

    // Priority filter
    if (priorityFilter !== 'all' && idea.priority !== priorityFilter) return false;

    // Tag filter
    if (selectedTag && !idea.tags?.includes(selectedTag)) return false;

    return true;
  });

  const handleOpenDetails = (idea: Idea) => {
    setActiveIdeaForDetails(idea);
    setSelectedIdeaId(idea.id);
    setIsDetailsModalOpen(true);
  };

  const handleOpenConvertToProject = (idea: Idea) => {
    setTargetIdeaForConversion(idea);
    setIsConvertToProjectOpen(true);
  };

  const handleOpenConvertToTask = (idea: Idea) => {
    setTargetIdeaForConversion(idea);
    setIsConvertToTaskOpen(true);
  };

  const handleOpenMinutes = (meeting: ThinkTankMeeting) => {
    setActiveMeetingForMinutes(meeting);
    setIsMinutesModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-l from-indigo-900 via-slate-900 to-slate-950 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        {/* Subtle geometric pattern overlay */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>مرکز نوآوری و مدیریت دانش سازمانی</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              اتاق فکر و مدیریت ایده‌های تدبیر
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              بستری تعاملی برای شناسایی مسائل، ثبت راه‌حل‌های نوآورانه، رأی‌گیری کارشناسی، نظرسنجی و تبدیل ایده‌های برتر به پروژه‌ها و وظایف اجرایی.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {hasPermission('thinktank_create') && (
              <>
                <button
                  onClick={() => setIsCreateMeetingOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-sm transition-all"
                >
                  <Calendar className="w-4 h-4 text-indigo-300" />
                  <span>هماهنگی جلسه اتاق فکر</span>
                </button>

                <button
                  onClick={() => setIsCreateIdeaOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all"
                >
                  <Lightbulb className="w-4 h-4 text-amber-300" />
                  <span>ثبت ایده و پیشنهاد جدید</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-slate-400 text-[11px] font-medium">کل ایده‌های ثبت شده</div>
            <div className="text-xl font-bold font-mono text-white mt-0.5">{totalIdeasCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-blue-300 text-[11px] font-medium">در حال ارزیابی و رأی‌گیری</div>
            <div className="text-xl font-bold font-mono text-blue-400 mt-0.5">{underReviewCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-emerald-300 text-[11px] font-medium">تأیید شده برای اجرا</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{approvedCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-purple-300 text-[11px] font-medium">تبدیل به پروژه / تسک</div>
            <div className="text-xl font-bold font-mono text-purple-400 mt-0.5">{convertedCount}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10 col-span-2 sm:col-span-1">
            <div className="text-amber-300 text-[11px] font-medium">جلسات و کارگروه‌ها</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{meetingsCount}</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>همه ایده‌ها ({totalIdeasCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('under_review')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'under_review'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>در حال ارزیابی و رأی‌گیری ({underReviewCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('approved')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'approved'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>تأیید شده ({approvedCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('in_progress')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'in_progress'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>در حال پیاده‌سازی ({convertedCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('meetings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'meetings'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>جلسات و صورتجلسات ({meetingsCount})</span>
          </button>
        </div>

        {activeTab !== 'meetings' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در ایده‌ها، مسائل..."
                className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar for Ideas */}
      {activeTab !== 'meetings' && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>فیلترها:</span>
            </div>

            {/* Department filter */}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">همه واحدهای سازمانی</option>
              {allDepartments.map((dept, idx) => (
                <option key={idx} value={dept}>{dept}</option>
              ))}
            </select>

            {/* Priority filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">همه اولویت‌ها</option>
              <option value="urgent">فوری</option>
              <option value="high">بالا</option>
              <option value="medium">متوسط</option>
              <option value="low">پایین</option>
            </select>

            {/* Tag pills */}
            {selectedTag && (
              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                #{selectedTag}
                <button onClick={() => setSelectedTag(null)} className="hover:text-rose-600 font-bold ml-1">×</button>
              </span>
            )}
          </div>

          <div className="text-xs text-slate-500">
            نمایش <span className="font-bold text-slate-800">{filteredIdeas.length}</span> ایده
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'meetings' ? (
        <ThinkTankMeetingsTab
          onOpenCreateMeeting={() => setIsCreateMeetingOpen(true)}
          onOpenMinutesModal={handleOpenMinutes}
          onOpenIdeaDetails={(ideaId) => {
            const tgt = ideas.find(i => i.id === ideaId);
            if (tgt) handleOpenDetails(tgt);
          }}
        />
      ) : (
        <div className="space-y-6">
          {filteredIdeas.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                <Lightbulb className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">ایده‌ای با این مشخصات یافت نشد</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                می‌توانید فیلترها را تغییر داده یا همین حالا ایده جدیدی در اتاق فکر ثبت کنید.
              </p>
              {hasPermission('thinktank_create') && (
                <button
                  onClick={() => setIsCreateIdeaOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت ایده جدید</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredIdeas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onOpenDetails={handleOpenDetails}
                  onConvertToProject={handleOpenConvertToProject}
                  onConvertToTask={handleOpenConvertToTask}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isCreateIdeaOpen && (
        <CreateIdeaModal
          isOpen={isCreateIdeaOpen}
          onClose={() => setIsCreateIdeaOpen(false)}
        />
      )}

      {isDetailsModalOpen && activeIdeaForDetails && (
        <IdeaDetailsModal
          ideaId={activeIdeaForDetails.id}
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setActiveIdeaForDetails(null);
            setSelectedIdeaId(null);
          }}
          onOpenConvertToProject={handleOpenConvertToProject}
          onOpenConvertToTask={handleOpenConvertToTask}
        />
      )}

      {isConvertToProjectOpen && targetIdeaForConversion && (
        <ConvertToProjectModal
          idea={targetIdeaForConversion}
          isOpen={isConvertToProjectOpen}
          onClose={() => {
            setIsConvertToProjectOpen(false);
            setTargetIdeaForConversion(null);
          }}
        />
      )}

      {isConvertToTaskOpen && targetIdeaForConversion && (
        <ConvertToTaskModal
          idea={targetIdeaForConversion}
          isOpen={isConvertToTaskOpen}
          onClose={() => {
            setIsConvertToTaskOpen(false);
            setTargetIdeaForConversion(null);
          }}
        />
      )}

      {isCreateMeetingOpen && (
        <CreateMeetingModal
          isOpen={isCreateMeetingOpen}
          onClose={() => setIsCreateMeetingOpen(false)}
        />
      )}

      {isMinutesModalOpen && activeMeetingForMinutes && (
        <MeetingMinutesModal
          meeting={activeMeetingForMinutes}
          isOpen={isMinutesModalOpen}
          onClose={() => {
            setIsMinutesModalOpen(false);
            setActiveMeetingForMinutes(null);
          }}
        />
      )}
    </div>
  );
};
