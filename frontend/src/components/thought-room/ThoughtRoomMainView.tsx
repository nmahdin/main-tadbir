import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Lightbulb, Plus, SlidersHorizontal } from 'lucide-react';
import { Idea, Priority, ThinkTankMeeting } from '../../types';
import { useApp } from '../../context/AppContext';
import { IdeaCard } from './IdeaCard';
import { IdeaDetailsModal } from './IdeaDetailsModal';
import { CreateIdeaModal } from './CreateIdeaModal';
import { ConvertToProjectModal } from './ConvertToProjectModal';
import { ConvertToTaskModal } from './ConvertToTaskModal';
import { ThinkTankMeetingsTab } from './ThinkTankMeetingsTab';
import { CreateMeetingModal } from './CreateMeetingModal';
import { MeetingMinutesModal } from './MeetingMinutesModal';
import { ModuleErrorBanner } from '../common/Feedback';
import { Button, Select } from '../common/Primitives';

export const ThoughtRoomMainView: React.FC = () => {
  const { ideas, thinkTankMeetings, setSelectedIdeaId, hasPermission, meetingModalRequest } = useApp();
  const [activeTab, setActiveTab] = useState<'ideas' | 'meetings'>('ideas');
  const [ideaStatusFilter, setIdeaStatusFilter] = useState('active');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');

  const [isCreateIdeaOpen, setIsCreateIdeaOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [activeIdeaForDetails, setActiveIdeaForDetails] = useState<Idea | null>(null);
  const [isConvertToProjectOpen, setIsConvertToProjectOpen] = useState(false);
  const [isConvertToTaskOpen, setIsConvertToTaskOpen] = useState(false);
  const [targetIdeaForConversion, setTargetIdeaForConversion] = useState<Idea | null>(null);
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState(false);
  const [isMinutesModalOpen, setIsMinutesModalOpen] = useState(false);
  const [activeMeetingForMinutes, setActiveMeetingForMinutes] = useState<ThinkTankMeeting | null>(null);
  const [meetingToEdit, setMeetingToEdit] = useState<ThinkTankMeeting | null>(null);
  const lastMeetingRequest = useRef(0);

  useEffect(() => {
    if (meetingModalRequest > lastMeetingRequest.current) {
      lastMeetingRequest.current = meetingModalRequest;
      setActiveTab('meetings');
      setMeetingToEdit(null);
      setIsCreateMeetingOpen(true);
    }
  }, [meetingModalRequest]);

  const liveMeetingForMinutes = activeMeetingForMinutes
    ? thinkTankMeetings.find(meeting => meeting.id === activeMeetingForMinutes.id) || activeMeetingForMinutes
    : null;
  const allDepartments = Array.from(new Set(ideas.map(idea => idea.targetDepartment).filter((value): value is string => !!value)));
  const allTags = Array.from(new Set(ideas.flatMap(idea => idea.tags || [])));
  const filteredIdeas = ideas.filter(idea => {
    if (ideaStatusFilter === 'active' && idea.status === 'archived') return false;
    if (ideaStatusFilter !== 'active' && ideaStatusFilter !== 'all' && idea.status !== ideaStatusFilter) return false;
    if (departmentFilter !== 'all' && idea.targetDepartment !== departmentFilter) return false;
    if (priorityFilter !== 'all' && idea.priority !== priorityFilter) return false;
    if (selectedTag !== 'all' && !idea.tags?.includes(selectedTag)) return false;
    return true;
  });

  const handleOpenDetails = (idea: Idea) => {
    setActiveIdeaForDetails(idea);
    setSelectedIdeaId(idea.id);
    setIsDetailsModalOpen(true);
  };
  const handleOpenConvertToProject = (idea: Idea) => { setTargetIdeaForConversion(idea); setIsConvertToProjectOpen(true); };
  const handleOpenConvertToTask = (idea: Idea) => { setTargetIdeaForConversion(idea); setIsConvertToTaskOpen(true); };
  const handleOpenMinutes = (meeting: ThinkTankMeeting) => { setActiveMeetingForMinutes(meeting); setIsMinutesModalOpen(true); };

  return (
    <div className="space-y-5 pb-12" dir="rtl">
      <ModuleErrorBanner modules={['ideas', 'meetings']} label="اتاق فکر" />

      <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Lightbulb className="h-5 w-5" /></span>
            <div><h1 className="text-xl font-black text-slate-900">ایده‌ها و جلسات اتاق فکر</h1><p className="mt-1 text-xs text-slate-500">ثبت ایده، ارزیابی پیشنهادها و مدیریت خروجی جلسات در دو بخش مستقل</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === 'ideas' && hasPermission('thinktank.create_idea') && <Button onClick={() => setIsCreateIdeaOpen(true)}><Plus className="h-4 w-4" />ثبت ایده جدید</Button>}
            {activeTab === 'meetings' && hasPermission('thinktank.manage_meetings') && <Button onClick={() => { setMeetingToEdit(null); setIsCreateMeetingOpen(true); }}><Calendar className="h-4 w-4" />جلسه جدید</Button>}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="بخش‌های اتاق فکر">
        <button type="button" role="tab" aria-selected={activeTab === 'ideas'} onClick={() => setActiveTab('ideas')} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${activeTab === 'ideas' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Lightbulb className="h-4 w-4" />ایده‌ها<span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === 'ideas' ? 'bg-white/20' : 'bg-slate-100'}`}>{ideas.length.toLocaleString('fa-IR')}</span></button>
        <button type="button" role="tab" aria-selected={activeTab === 'meetings'} onClick={() => setActiveTab('meetings')} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${activeTab === 'meetings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Calendar className="h-4 w-4" />جلسه‌ها<span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === 'meetings' ? 'bg-white/20' : 'bg-slate-100'}`}>{thinkTankMeetings.length.toLocaleString('fa-IR')}</span></button>
      </div>

      {activeTab === 'ideas' ? <>
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="فیلترهای ایده‌ها">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black text-slate-700"><SlidersHorizontal className="h-4 w-4 text-indigo-600" />فیلترهای ایده‌ها</div><span className="text-[11px] text-slate-500">{filteredIdeas.length.toLocaleString('fa-IR')} ایده</span></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[11px] font-bold text-slate-600">وضعیت<Select className="mt-1.5 text-xs" value={ideaStatusFilter} onChange={event => setIdeaStatusFilter(event.target.value)}><option value="active">ایده‌های فعال</option><option value="all">همه ایده‌ها</option><option value="submitted">ثبت‌شده</option><option value="under_review">در حال ارزیابی</option><option value="approved">تأییدشده</option><option value="in_progress">در حال اجرا</option><option value="completed">تکمیل‌شده</option><option value="archived">بایگانی‌شده</option></Select></label>
            <label className="text-[11px] font-bold text-slate-600">واحد سازمانی<Select className="mt-1.5 text-xs" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}><option value="all">همه واحدها</option>{allDepartments.map(department => <option key={department} value={department}>{department}</option>)}</Select></label>
            <label className="text-[11px] font-bold text-slate-600">اولویت<Select className="mt-1.5 text-xs" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="all">همه اولویت‌ها</option>{(['urgent', 'high', 'medium', 'low'] as Priority[]).map(priority => <option key={priority} value={priority}>{priority === 'urgent' ? 'فوری' : priority === 'high' ? 'بالا' : priority === 'medium' ? 'متوسط' : 'پایین'}</option>)}</Select></label>
            <label className="text-[11px] font-bold text-slate-600">برچسب<Select className="mt-1.5 text-xs" value={selectedTag} onChange={event => setSelectedTag(event.target.value)}><option value="all">همه برچسب‌ها</option>{allTags.map(tag => <option key={tag} value={tag}>#{tag}</option>)}</Select></label>
          </div>
        </section>

        {filteredIdeas.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{filteredIdeas.map(idea => <IdeaCard key={idea.id} idea={idea} onOpenDetails={handleOpenDetails} onConvertToProject={handleOpenConvertToProject} onConvertToTask={handleOpenConvertToTask} onEdit={ideaToEdit => { setEditingIdea(ideaToEdit); setIsCreateIdeaOpen(true); }} />)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Lightbulb className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-800">ایده‌ای مطابق فیلترها نیست</h2><p className="mt-1 text-xs text-slate-500">فیلترها را تغییر دهید یا ایده جدیدی ثبت کنید.</p></div>}
      </> : <ThinkTankMeetingsTab onEditMeeting={meeting => { setMeetingToEdit(meeting); setIsCreateMeetingOpen(true); }} onOpenMinutesModal={handleOpenMinutes} onOpenIdeaDetails={ideaId => { const idea = ideas.find(item => item.id === ideaId); if (idea) handleOpenDetails(idea); }} />}

      {/* Modals */}
      {isCreateIdeaOpen && (
        <CreateIdeaModal
          isOpen={isCreateIdeaOpen}
          ideaToEdit={editingIdea}
          onClose={() => {
            setIsCreateIdeaOpen(false);
            setEditingIdea(null);
          }}
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
          onEdit={(idea) => {
            setIsDetailsModalOpen(false);
            setActiveIdeaForDetails(null);
            setEditingIdea(idea);
            setIsCreateIdeaOpen(true);
          }}
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
          key={meetingToEdit?.id || 'new'}
          meeting={meetingToEdit}
          isOpen={isCreateMeetingOpen}
          onClose={() => setIsCreateMeetingOpen(false)}
        />
      )}

      {isMinutesModalOpen && liveMeetingForMinutes && (
        <MeetingMinutesModal
          meeting={liveMeetingForMinutes}
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
