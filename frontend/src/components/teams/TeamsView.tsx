import { EditTeamModal } from './EditTeamModal';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User, Team, Role } from '../../types';
import { Avatar, AvatarGroup, ProgressBar } from '../common/Avatar';
import {
  Users2,
  Edit2,
  Plus,
  Search,
  Mail,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Layers,
  ArrowUpRight,
  TrendingUp,
  UserCheck
} from 'lucide-react';

export const TeamsView: React.FC = () => {
  const {
    teams,
    users,
    projects,
    tasks,
    currentUser,
    setSelectedMemberId,
    setIsCreateTeamOpen
  } = useApp();

  const [activeTab, setActiveTab] = useState<'teams' | 'members'>('members');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const canManage = currentUser.role === 'admin' || currentUser.role === 'project_manager';

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users2 className="w-6 h-6 text-indigo-600" />
            <span>مدیریت تیم‌ها و اعضا</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            مدیریت تیم‌های دائمی، پروژه‌ای و موقت سازمانی
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateTeamOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد تیم</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs & Search Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Tabs */}
          <div className="flex overflow-x-auto p-1 bg-slate-100 rounded-xl border border-slate-200/70 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('members')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'members'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              لیست اعضا ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'teams'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              تیم‌ها و گروه‌ها ({teams.length})
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-2.5 flex-1 max-w-xl justify-end flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-600 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, skill, title..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
            />
          </div>

          {activeTab === 'members' && (
            <>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden"
              >
                <option value="all">همه دپارتمان‌ها</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden"
              >
                <option value="all">همه نقش‌ها</option>
                <option value="admin">Admin</option>
                <option value="project_manager">Project Manager</option>
                <option value="team_member">عضو تیم</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* Tab: لیست اعضا */}
      {activeTab === 'members' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredUsers.map(member => {
            const memberTasks = tasks.filter(t => t.assigneeId === member.id);
            const activeTasks = memberTasks.filter(t => t.status !== 'completed');
            const completedTasks = memberTasks.filter(t => t.status === 'completed');
            const isOverloaded = member.workloadPercentage > 85;

            return (
              <div
                key={member.id}
                onClick={() => setSelectedMemberId(member.id)}
                className="bg-white rounded-3xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-md transition-all p-5 flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  {/* Top card info */}
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

                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                      {member.role.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Skills tags */}
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
                </div>

                {/* Workload and Task Stats Bottom */}
                <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                      <span className="text-slate-600">Workload Capacity</span>
                      <span className={isOverloaded ? 'text-rose-600 font-extrabold flex items-center gap-1' : 'text-slate-800'}>
                        {isOverloaded && <AlertTriangle className="w-3 h-3 text-rose-500" />}
                        {member.workloadPercentage}%
                      </span>
                    </div>
                    <ProgressBar
                      progress={member.workloadPercentage}
                      color={isOverloaded ? '#ef4444' : member.workloadPercentage > 65 ? '#f59e0b' : '#6366f1'}
                      size="sm"
                    />
                  </div>

                  <div className="flex items-center justify-between text-slate-600 text-[11px] pt-1">
                    <span>
                      <strong className="text-slate-900">{activeTasks.length}</strong> active tasks
                    </span>
                    <span>
                      <strong className="text-emerald-600">{completedTasks.length}</strong> completed
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: تیم‌ها و گروه‌ها */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams.map(team => {
            const teamLeader = users.find(u => u.id === team.leaderId);
            const teamMembers = users.filter(u => team.memberIds.includes(u.id));
            const teamProjects = projects.filter(p => team.projectIds.includes(p.id));

            const avgWorkload = Math.round(
              teamMembers.reduce((sum, m) => sum + m.workloadPercentage, 0) / (teamMembers.length || 1)
            );

            return (
              <div
                key={team.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all p-6 flex flex-col justify-between relative overflow-hidden"
              >
                <div 
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: team.color }}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
        {team.department}
      </span>
      {canManage && (
        <button
          onClick={() => setEditingTeam(team)}
          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
          title="ویرایش تیم"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
    <span className="text-xs font-bold text-slate-700">
      {teamMembers.length} عضو
    </span>
  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {team.name}
                  </h3>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {team.description}
                  </p>

                  {/* سرپرست تیم */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <Avatar user={teamLeader} size="xs" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-600 block">Lead</span>
                      <span className="font-bold text-slate-900">{teamLeader?.name}</span>
                    </div>
                  </div>
                </div>

                {/* Team Footer: Members, Projects, Average Workload */}
                <div className="space-y-4 pt-4 border-t border-slate-100 mt-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>Avg Pod بار کاری</span>
                      <span className="text-indigo-600">{avgWorkload}%</span>
                    </div>
                    <ProgressBar progress={avgWorkload} color={team.color} size="sm" />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 font-medium">Members:</span>
                      <AvatarGroup users={teamMembers} max={4} size="xs" />
                    </div>

                    <span className="text-xs font-semibold text-slate-700">
                      {teamProjects.length} Projects
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
