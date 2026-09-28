import { EditTeamModal } from './EditTeamModal';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Team } from '../../types';
import { Avatar, AvatarGroup, ProgressBar } from '../common/Avatar';
import { ModuleErrorBanner } from '../common/Feedback';
import {
  Users2,
  Edit2,
  Plus,
  Search,
  Briefcase,
  AlertTriangle,
  Trash2,
  ChevronDown,
  FolderKanban,
  Gauge,
  UserCheck,
  Crown
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدیر سیستم',
  project_manager: 'مدیر پروژه',
  content_manager: 'مدیر محتوا',
  team_lead: 'سرپرست تیم',
  team_member: 'عضو تیم',
  viewer: 'ناظر'
};

export const TeamsView: React.FC = () => {
  const {
    teams,
    users,
    projects,
    tasks,
    roles,
    currentUser,
    setSelectedMemberId,
    setIsCreateTeamOpen,
    hasPermission,
    deleteTeam,
    setSelectedProjectId,
    setActiveView
  } = useApp();

  const [activeTab, setActiveTab] = useState<'teams' | 'members'>('teams');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const canCreateTeam = hasPermission('teams.create');
  const canEditTeam = hasPermission('teams.edit');
  const canDeleteTeam = hasPermission('teams.delete');

  const roleLabel = (role: string, roleId?: string) => {
    if (roleId) {
      const found = roles.find(r => r.id === roleId || r.key === roleId);
      if (found) return found.name;
    }
    return ROLE_LABELS[role] || role.replace('_', ' ');
  };

  // Filtered اعضا
  const filteredUsers = users.filter(u => {
    const matchesSearch =
      !searchTerm ||
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.skills.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDept = departmentFilter === 'all' || u.department === departmentFilter;
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    return matchesSearch && matchesDept && matchesRole;
  });

  // Filtered تیم‌ها
  const filteredTeams = teams.filter(t => {
    return !searchTerm ||
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.department.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const departments = Array.from(new Set(users.map(u => u.department)));

  // Stats
  const uniqueMemberIds = new Set<string>();
  teams.forEach(t => t.memberIds.forEach(id => uniqueMemberIds.add(id)));
  const linkedProjectIds = new Set<string>();
  teams.forEach(t => t.projectIds.forEach(id => linkedProjectIds.add(id)));
  const avgWorkload = users.length > 0
    ? Math.round(users.reduce((sum, u) => sum + (u.workloadPercentage || 0), 0) / users.length)
    : 0;

  const handleDeleteTeam = (team: Team) => {
    if (window.confirm(`آیا از حذف تیم «${team.name}» اطمینان دارید؟`)) {
      deleteTeam(team.id);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6" dir="rtl">
      <ModuleErrorBanner modules={['teams']} label="تیم‌ها" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Users2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              مدیریت تیم‌ها و اعضا
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              تیم‌های سازمانی، اعضای هر تیم و ظرفیت کاری آن‌ها
            </p>
          </div>
        </div>

        {canCreateTeam && (
          <button
            onClick={() => setIsCreateTeamOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>ایجاد تیم</span>
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Users2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">{teams.length}</p>
            <p className="text-[11px] font-bold text-slate-500">تیم فعال</p>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">{uniqueMemberIds.size}</p>
            <p className="text-[11px] font-bold text-slate-500">عضو در تیم‌ها</p>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">{linkedProjectIds.size}</p>
            <p className="text-[11px] font-bold text-slate-500">پروژه مرتبط</p>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">{avgWorkload}٪</p>
            <p className="text-[11px] font-bold text-slate-500">میانگین بار کاری</p>
          </div>
        </div>
      </div>

      {/* Tabs & Search Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200/70 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('teams')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'teams'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            تیم‌ها ({teams.length})
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'members'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            همه اعضا ({users.length})
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-1 max-w-xl justify-end flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو بر اساس نام، مهارت، عنوان..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
            />
          </div>

          {activeTab === 'members' && (
            <>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="all">همه دپارتمان‌ها</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="all">همه نقش‌ها</option>
                <option value="admin">مدیر سیستم</option>
                <option value="project_manager">مدیر پروژه</option>
                <option value="team_lead">سرپرست تیم</option>
                <option value="team_member">عضو تیم</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* Tab: تیم‌ها */}
      {activeTab === 'teams' && (
        <div className="space-y-4">
          {filteredTeams.length === 0 && (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
              <Users2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-500">تیمی یافت نشد.</p>
            </div>
          )}
          {filteredTeams.map(team => {
            const teamLeader = users.find(u => u.id === team.leaderId);
            const teamMembers = users.filter(u => team.memberIds.includes(u.id));
            const teamProjects = projects.filter(p => team.projectIds.includes(p.id));
            const isExpanded = expandedTeamId === team.id;

            const avgTeamWorkload = Math.round(
              teamMembers.reduce((sum, m) => sum + (m.workloadPercentage || 0), 0) / (teamMembers.length || 1)
            );

            return (
              <div
                key={team.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all overflow-hidden relative"
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: team.color }}
                />

                <div className="p-5 sm:p-6">
                  {/* Team header */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow-md"
                        style={{ backgroundColor: team.color }}
                      >
                        {team.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-slate-900">{team.name}</h3>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {team.department}
                          </span>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                            {teamMembers.length} عضو
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-2xl">
                          {team.description || 'توضیحی برای این تیم ثبت نشده است.'}
                        </p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Crown className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-slate-500 font-medium">سرپرست:</span>
                            <span className="font-bold text-slate-900">{teamLeader?.name || 'نامشخص'}</span>
                          </div>
                          <AvatarGroup users={teamMembers} max={5} size="xs" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isExpanded
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        <span>اعضای تیم</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {canEditTeam && (
                        <button
                          onClick={() => setEditingTeam(team)}
                          title="ویرایش تیم"
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {canDeleteTeam && (
                        <button
                          onClick={() => handleDeleteTeam(team)}
                          title="حذف تیم"
                          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Workload + projects strip */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                        <span>میانگین بار کاری تیم</span>
                        <span className={avgTeamWorkload > 85 ? 'text-rose-600' : 'text-indigo-600'}>
                          {avgTeamWorkload}٪
                        </span>
                      </div>
                      <ProgressBar
                        progress={avgTeamWorkload}
                        color={avgTeamWorkload > 85 ? '#ef4444' : team.color}
                        size="sm"
                      />
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span>پروژه‌های مرتبط ({teamProjects.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {teamProjects.length === 0 && (
                          <span className="text-[11px] text-slate-400 font-medium">پروژه‌ای متصل نیست</span>
                        )}
                        {teamProjects.slice(0, 4).map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setSelectedProjectId(p.id); setActiveView('project-detail'); }}
                            className="text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            {p.name}
                          </button>
                        ))}
                        {teamProjects.length > 4 && (
                          <span className="text-[11px] font-bold text-slate-500 px-1 py-1">
                            +{teamProjects.length - 4} مورد دیگر
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable members section */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                      <h4 className="text-xs font-extrabold text-slate-800 mb-3 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-indigo-600" />
                        اعضای تیم {team.name} ({teamMembers.length})
                      </h4>
                      {teamMembers.length === 0 ? (
                        <p className="text-xs text-slate-400 font-medium py-4 text-center">
                          عضوی در این تیم ثبت نشده است.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {teamMembers.map(member => {
                            const activeCount = tasks.filter(
                              t => t.assigneeId === member.id && t.status !== 'completed' && t.status !== 'archived'
                            ).length;
                            const isLeader = member.id === team.leaderId;
                            const overloaded = (member.workloadPercentage || 0) > 85;
                            return (
                              <div
                                key={member.id}
                                onClick={() => setSelectedMemberId(member.id)}
                                className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer group"
                              >
                                <Avatar user={member} size="md" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <h5 className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-700 truncate">
                                      {member.name}
                                    </h5>
                                    {isLeader && (
                                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0">
                                        <Crown className="w-2.5 h-2.5" />
                                        سرپرست
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    {member.title} • {roleLabel(member.role, member.roleId)}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <div className="flex-1">
                                      <ProgressBar
                                        progress={member.workloadPercentage || 0}
                                        color={overloaded ? '#ef4444' : '#6366f1'}
                                        size="sm"
                                      />
                                    </div>
                                    <span className={`text-[10px] font-bold shrink-0 ${overloaded ? 'text-rose-600' : 'text-slate-500'}`}>
                                      {member.workloadPercentage || 0}٪
                                    </span>
                                  </div>
                                </div>
                                <div className="text-center shrink-0 px-2 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                                  <p className="text-sm font-black text-slate-900">{activeCount}</p>
                                  <p className="text-[9px] font-bold text-slate-500">وظیفه فعال</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: همه اعضا */}
      {activeTab === 'members' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredUsers.map(member => {
            const memberTasks = tasks.filter(t => t.assigneeId === member.id && t.status !== 'archived');
            const activeTasks = memberTasks.filter(t => t.status !== 'completed');
            const completedTasks = memberTasks.filter(t => t.status === 'completed');
            const isOverloaded = (member.workloadPercentage || 0) > 85;
            const memberTeams = teams.filter(t => t.memberIds.includes(member.id));

            return (
              <div
                key={member.id}
                onClick={() => setSelectedMemberId(member.id)}
                className="bg-white rounded-3xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-md transition-all p-5 flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar user={member} size="lg" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {member.name}
                        </h4>
                        <p className="text-xs text-slate-600">{member.title}</p>
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md mt-1 inline-block">
                          {member.department}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 whitespace-nowrap">
                      {roleLabel(member.role, member.roleId)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {member.skills.slice(0, 3).map(skill => (
                      <span key={skill} className="text-[10px] bg-slate-50 border border-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md">
                        {skill}
                      </span>
                    ))}
                    {member.skills.length > 3 && (
                      <span className="text-[10px] text-slate-600 font-bold px-1.5 py-0.5">
                        +{member.skills.length - 3}
                      </span>
                    )}
                  </div>

                  {memberTeams.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {memberTeams.slice(0, 3).map(t => (
                        <span key={t.id} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          {t.name}
                        </span>
                      ))}
                      {memberTeams.length > 3 && (
                        <span className="text-[10px] font-bold text-slate-400 px-1 py-0.5">
                          +{memberTeams.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                      <span className="text-slate-600">ظرفیت کاری</span>
                      <span className={isOverloaded ? 'text-rose-600 font-extrabold flex items-center gap-1' : 'text-slate-800'}>
                        {isOverloaded && <AlertTriangle className="w-3 h-3 text-rose-500" />}
                        {member.workloadPercentage || 0}٪
                      </span>
                    </div>
                    <ProgressBar
                      progress={member.workloadPercentage || 0}
                      color={isOverloaded ? '#ef4444' : (member.workloadPercentage || 0) > 65 ? '#f59e0b' : '#6366f1'}
                      size="sm"
                    />
                  </div>

                  <div className="flex items-center justify-between text-slate-600 text-[11px] pt-1">
                    <span>
                      <strong className="text-slate-900">{activeTasks.length}</strong> وظیفه فعال
                    </span>
                    <span>
                      <strong className="text-emerald-600">{completedTasks.length}</strong> تکمیل‌شده
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditTeamModal
        team={editingTeam}
        isOpen={!!editingTeam}
        onClose={() => setEditingTeam(null)}
      />
    </div>
  );
};
