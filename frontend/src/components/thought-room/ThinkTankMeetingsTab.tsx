import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Plus, 
  FileText, 
  CheckCircle2, 
  CheckSquare, 
  Lightbulb, 
  Trash2, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { ThinkTankMeeting } from '../../types';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';

interface ThinkTankMeetingsTabProps {
  onOpenCreateMeeting: () => void;
  onOpenMinutesModal: (meeting: ThinkTankMeeting) => void;
  onOpenIdeaDetails?: (ideaId: string) => void;
}

export const ThinkTankMeetingsTab: React.FC<ThinkTankMeetingsTabProps> = ({
  onOpenCreateMeeting,
  onOpenMinutesModal,
  onOpenIdeaDetails
}) => {
  const { 
    thinkTankMeetings, 
    users, 
    ideas, 
    projects, 
    deleteThinkTankMeeting, 
    convertActionItemToTask,
    hasPermission 
  } = useApp();

  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(
    thinkTankMeetings[0]?.id || null
  );
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<string>(
    projects[0]?.id || ''
  );

  const toggleExpand = (id: string) => {
    setExpandedMeetingId(expandedMeetingId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-indigo-300 text-xs font-bold">
            <Calendar className="w-4 h-4" />
            <span>جلسات و کارگروه‌های طوفان فکری</span>
          </div>
          <h2 className="text-lg font-bold">نشست‌های تخصصی و صورتجلسات اتاق فکر</h2>
          <p className="text-xs text-slate-300 mt-1">
            برگزاری جلسات، ثبت خرد جمعی، ثبت صورتجلسه رسمی و تبدیل خروجی‌ها به تسک‌های عملیاتی
          </p>
        </div>

        {hasPermission('thinktank_create') && (
          <button
            onClick={onOpenCreateMeeting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>برنامه‌ریزی جلسه جدید</span>
          </button>
        )}
      </div>

      {/* Meetings List */}
      <div className="space-y-4">
        {thinkTankMeetings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
            هنوز جلسه‌ای برای اتاق فکر ثبت نشده است.
          </div>
        ) : (
          thinkTankMeetings.map((meeting) => {
            const organizer = users.find(u => u.id === meeting.organizerId);
            const isExpanded = expandedMeetingId === meeting.id;

            return (
              <div 
                key={meeting.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all"
              >
                {/* Meeting Header Bar */}
                <div 
                  onClick={() => toggleExpand(meeting.id)}
                  className="p-5 flex items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        meeting.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : meeting.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {meeting.status === 'completed' ? 'برگزار شده و دارای صورتجلسه' : 'برنامه‌ریزی شده'}
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        <Calendar className="w-3.5 h-3.5" />
                        {meeting.date}
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        <Clock className="w-3.5 h-3.5" />
                        {meeting.time} ({meeting.duration})
                      </span>

                      {meeting.locationDetails && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          <MapPin className="w-3.5 h-3.5" />
                          {meeting.locationDetails}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-800">{meeting.title}</h3>
                    {meeting.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">{meeting.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {meeting.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        صورتجلسه ثبت شده
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMinutesModal(meeting);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        ثبت صورتجلسه
                      </button>
                    )}

                    <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="p-6 border-t border-slate-100 bg-slate-50/40 space-y-5 animate-in fade-in duration-150">
                    {/* Attendees & Organizer */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="font-bold text-slate-600 block mb-1.5">هماهنگ‌کننده:</span>
                        <div className="flex items-center gap-2">
                          {organizer && <Avatar user={organizer} size="sm" />}
                          <span className="font-medium text-slate-800">{organizer?.name}</span>
                        </div>
                      </div>

                      <div>
                        <span className="font-bold text-slate-600 block mb-1.5">
                          اعضای حاضر در جلسه ({meeting.attendeeIds?.length || 0} نفر):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {meeting.attendeeIds?.map(id => {
                            const u = users.find(user => user.id === id);
                            return u ? (
                              <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-white border border-slate-200 text-slate-700 font-medium">
                                <Avatar user={u} size="xs" />
                                {u.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Agenda items */}
                    {meeting.agenda && meeting.agenda.length > 0 && (
                      <div>
                        <h4 className="font-bold text-xs text-slate-700 mb-2">دستور کار جلسه:</h4>
                        <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                          {meeting.agenda.map((ag, idx) => (
                            <li key={idx}>{ag}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Related Ideas */}
                    {meeting.relatedIdeaIds && meeting.relatedIdeaIds.length > 0 && (
                      <div>
                        <h4 className="font-bold text-xs text-slate-700 mb-2">ایده‌های مرتبط مورد بحث:</h4>
                        <div className="flex flex-wrap gap-2">
                          {meeting.relatedIdeaIds.map(ideaId => {
                            const relIdea = ideas.find(i => i.id === ideaId);
                            if (!relIdea) return null;
                            return (
                              <button
                                key={ideaId}
                                onClick={() => onOpenIdeaDetails && onOpenIdeaDetails(ideaId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors font-medium"
                              >
                                <Lightbulb className="w-3.5 h-3.5 text-indigo-600" />
                                <span>{relIdea.code}: {relIdea.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Minutes Summary & Decisions */}
                    {meeting.status === 'completed' && (
                      <div className="space-y-4 pt-2 border-t border-slate-200">
                        {meeting.minutesSummary && (
                          <div className="p-4 bg-white rounded-xl border border-slate-200">
                            <h4 className="font-bold text-xs text-slate-800 mb-1.5 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-indigo-600" />
                              مشروح مذاکرات و خلاصه صورتجلسه
                            </h4>
                            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                              {meeting.minutesSummary}
                            </p>
                          </div>
                        )}

                        {meeting.decisions && meeting.decisions.length > 0 && (
                          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                            <h4 className="font-bold text-xs text-emerald-900 mb-2 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              تصمیمات و نتایج مصوب جلسه:
                            </h4>
                            <ul className="space-y-1.5 text-xs sm:text-sm text-emerald-900">
                              {meeting.decisions.map((dec, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="font-bold font-mono text-emerald-700">{idx + 1}.</span>
                                  <span>{dec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Action Items to Tasks */}
                        {meeting.actionItems && meeting.actionItems.length > 0 && (
                          <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-bold text-xs text-indigo-900 flex items-center gap-1.5">
                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                                اقدامات اجرایی و تبدیل به Task
                              </h4>
                              
                              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <span>پروژه هدف:</span>
                                <select
                                  value={selectedTaskProjectId}
                                  onChange={(e) => setSelectedTaskProjectId(e.target.value)}
                                  className="text-xs px-2 py-1 rounded border border-slate-300 bg-white"
                                >
                                  {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {meeting.actionItems.map((act) => {
                                const assignee = users.find(u => u.id === act.assigneeId);
                                const isConverted = act.status === 'converted' || !!act.convertedTaskId;

                                return (
                                  <div 
                                    key={act.id} 
                                    className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      {assignee && <Avatar user={assignee} size="sm" />}
                                      <div>
                                        <div className="font-bold text-slate-800">{act.title}</div>
                                        <div className="text-[11px] text-slate-500">
                                          مسئول: {assignee?.name || 'تعیین نشده'} | مهلت: {act.deadline || 'نامشخص'}
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      {isConverted ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          تسک در پروژه ثبت شد
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => convertActionItemToTask(meeting.id, act.id, selectedTaskProjectId)}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          تبدیل به Task
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer buttons */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs">
                      <button
                        onClick={() => onOpenMinutesModal(meeting)}
                        className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {meeting.status === 'completed' ? 'ویرایش صورتجلسه' : 'تکمیل و ثبت صورتجلسه'}
                      </button>

                      {hasPermission('thinktank_delete') && (
                        <button
                          onClick={() => {
                            if (confirm(`آیا از حذف جلسه «${meeting.title}» اطمینان دارید؟`)) {
                              deleteThinkTankMeeting(meeting.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 font-medium"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف جلسه
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
