import React from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import {
  X,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  CheckCircle2,
  Clock,
  Layers,
  AlertTriangle,
  Sparkles
} from 'lucide-react';

export const MemberDetailModal: React.FC = () => {
  const {
    selectedMemberId,
    setSelectedMemberId,
    users,
    tasks,
    projects,
    setSelectedTaskId,
    moveTaskStatus
  } = useApp();

  if (!selectedMemberId) return null;

  const member = users.find(u => u.id === selectedMemberId);
  if (!member) return null;

  const memberTasks = tasks.filter(t => t.assigneeId === member.id);
  const activeTasks = memberTasks.filter(t => t.status !== 'completed');
  const completedTasks = memberTasks.filter(t => t.status === 'completed');
  const assignedProjects = projects.filter(p => p.memberIds.includes(member.id));

  const totalEstHours = activeTasks.reduce((sum, t) => sum + t.estimatedHours, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Profile Cover */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative">
          <button
            onClick={() => setSelectedMemberId(null)}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4">
            <Avatar user={member} size="xl" className="border-4 border-white/20 shadow-md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold tracking-tight text-white">{member.name}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 font-bold uppercase tracking-wider border border-indigo-400/30">
                  {member.role.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-indigo-200 font-medium mt-0.5">{member.title} • {member.department}</p>
              
              <div className="flex items-center gap-4 text-xs text-slate-300 mt-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  {member.email}
                </span>
                {member.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    {member.location}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Capacity / Workload Status Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Workload Capacity:</span>
            <span className={`font-extrabold ${member.workloadPercentage > 85 ? 'text-rose-600' : 'text-indigo-600'}`}>
              {member.workloadPercentage}%
            </span>
            {member.workloadPercentage > 85 && (
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200">
                High Load
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-slate-600">
            <span>Active: <strong className="text-slate-900">{activeTasks.length}</strong></span>
            <span>Est. Load: <strong className="text-slate-900">{totalEstHours} hrs</strong></span>
            <span>Completed: <strong className="text-emerald-600">{completedTasks.length}</strong></span>
          </div>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Skills */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Skills & Proficiencies
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {member.skills.map(s => (
                <span key={s} className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-semibold">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Active Tasks Assigned */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center justify-between">
              <span>Active Tasks ({activeTasks.length})</span>
            </h4>

            {activeTasks.length === 0 ? (
              <p className="text-xs text-slate-600 py-2">No active tasks currently assigned.</p>
            ) : (
              <div className="space-y-2">
                {activeTasks.map(t => {
                  const proj = projects.find(p => p.id === t.projectId);
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedMemberId(null);
                        setSelectedTaskId(t.id);
                      }}
                      className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {proj && (
                            <span 
                              className="text-[10px] font-bold px-1.5 py-0.2 rounded-xs text-white"
                              style={{ backgroundColor: proj.color }}
                            >
                              {proj.key}
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-900 truncate">{t.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-600">Due {t.deadline} • {t.estimatedHours}h estimated</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityPill priority={t.priority} size="sm" />
                        <TaskStatusBadge status={t.status} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Involved Projects */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Involved Projects ({assignedProjects.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {assignedProjects.map(p => (
                <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
                  <div className="flex items-center gap-2 font-bold text-slate-800 mb-1 truncate">
                    <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-600">Progress: {p.progress}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
