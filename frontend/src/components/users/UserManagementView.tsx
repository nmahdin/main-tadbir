import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { User, UserStatus, Role } from '../../types';
import { Avatar } from '../common/Avatar';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  MoreVertical, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  UserX, 
  Edit3, 
  Trash2, 
  Eye, 
  KeyRound, 
  Mail, 
  Phone, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Sparkles,
  Shield,
  Download,
  Layers
} from 'lucide-react';

export const UserManagementView: React.FC = () => {
  const { 
    users, 
    currentUser, 
    roles, 
    setIsCreateUserOpen, 
    setIsEditUserOpen, 
    setUserToEdit, 
    deleteUser, 
    changeUserStatus, 
    bulkChangeUserStatus, 
    bulkDeleteUsers, 
    setActiveView, 
    setUserProfileId 
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Departments list from users
  const departments = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => {
      if (u.department) set.add(u.department);
    });
    return Array.from(set);
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        user.name.toLowerCase().includes(q) ||
        (user.username && user.username.toLowerCase().includes(q)) ||
        user.email.toLowerCase().includes(q) ||
        (user.phone && user.phone.includes(q)) ||
        (user.title && user.title.toLowerCase().includes(q)) ||
        (user.department && user.department.toLowerCase().includes(q));

      // Role
      const matchesRole = selectedRole === 'all' || user.role === selectedRole || user.roleId === selectedRole;

      // Status
      const matchesStatus = selectedStatus === 'all' || user.status === selectedStatus;

      // Department
      const matchesDept = selectedDepartment === 'all' || user.department === selectedDepartment;

      return matchesSearch && matchesRole && matchesStatus && matchesDept;
    });
  }, [users, searchQuery, selectedRole, selectedStatus, selectedDepartment]);

  // Statistics
  const totalCount = users.length;
  const activeCount = users.filter(u => u.status === 'active').length;
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const blockedCount = users.filter(u => u.status === 'blocked').length;

  // Checkbox handlers
  const handleSelectAll = () => {
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleSelectUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleEditUser = (user: User) => {
    setUserToEdit(user);
    setIsEditUserOpen(true);
    setActiveMenuUserId(null);
  };

  const handleViewProfile = (userId: string) => {
    setUserProfileId(userId);
    setActiveView('user-profile');
    setActiveMenuUserId(null);
  };

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>فعال</span>
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>غیرفعال</span>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>در انتظار تأیید</span>
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>مسدود شده</span>
          </span>
        );
    }
  };

  const getRoleBadge = (roleKeyOrId?: string, userRole?: Role) => {
    const foundRole = roles.find(r => r.id === roleKeyOrId || r.key === userRole || r.key === roleKeyOrId);
    const color = foundRole ? foundRole.color : '#6366f1';
    const name = foundRole ? foundRole.name : userRole === 'admin' ? 'مدیر ارشد' : userRole === 'project_manager' ? 'مدیر پروژه' : 'عضو تیم';

    return (
      <span 
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold shadow-2xs border"
        style={{
          backgroundColor: `${color}10`,
          borderColor: `${color}30`,
          color: color
        }}
      >
        <Shield className="w-3 h-3" />
        <span>{name}</span>
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right" dir="rtl">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
                مدیریت کاربران و دسترسی‌ها
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-extrabold border border-indigo-200">
                سامانه تدبیر
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              مدیریت یکپارچه پرسنل، تخصیص سطوح دسترسی، نظارت بر وضعیت حساب‌ها و احراز هویت
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setActiveView('roles-management')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>مدیریت نقش‌ها و مجوزها</span>
          </button>

          <button
            onClick={() => setIsCreateUserOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-indigo-200 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>افزودن کاربر جدید</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">کل کاربران سازمان</span>
            <span className="text-2xl font-black text-slate-900">{totalCount}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">در تمام دپارتمان‌ها</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">کاربران فعال</span>
            <span className="text-2xl font-black text-emerald-600">{activeCount}</span>
            <span className="text-[11px] text-emerald-600/80 block mt-0.5">دارای دسترسی کامل</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">در انتظار تأیید</span>
            <span className="text-2xl font-black text-amber-600">{pendingCount}</span>
            <span className="text-[11px] text-amber-600/80 block mt-0.5">نیاز به بازبینی مدارک</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">مسدود شده</span>
            <span className="text-2xl font-black text-rose-600">{blockedCount}</span>
            <span className="text-[11px] text-rose-600/80 block mt-0.5">حساب‌های غیرفعال</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <UserX className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجو بر اساس نام، نام کاربری، ایمیل، تلفن..."
              className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Role Filter */}
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">همه نقش‌ها</option>
              {roles.map(r => (
                <option key={r.id} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال</option>
              <option value="pending">در انتظار تأیید</option>
              <option value="blocked">مسدود شده</option>
            </select>

            {/* Department Filter */}
            <select
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">همه دپارتمان‌ها</option>
              {departments.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Action Bar (when rows are selected) */}
        {selectedUserIds.length > 0 && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
              <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs">
                {selectedUserIds.length}
              </span>
              <span>کاربر برای اعمال عملیات گروهی انتخاب شده است</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  bulkChangeUserStatus(selectedUserIds, 'active');
                  setSelectedUserIds([]);
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-bold text-xs transition-colors"
              >
                فعال‌سازی همگانی
              </button>

              <button
                onClick={() => {
                  bulkChangeUserStatus(selectedUserIds, 'blocked');
                  setSelectedUserIds([]);
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs transition-colors"
              >
                مسدودسازی
              </button>

              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                حذف گروهی ({selectedUserIds.length})
              </button>

              <button
                onClick={() => setSelectedUserIds([])}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800"
              >
                لغو انتخاب
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Users Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
                <th className="p-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.length > 0 && selectedUserIds.length === filteredUsers.length}
                    onChange={handleSelectAll}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="py-4 px-4">مشخصات کاربر</th>
                <th className="py-4 px-4">اطلاعات تماس</th>
                <th className="py-4 px-4">نقش سیستمی</th>
                <th className="py-4 px-4">واحد سازمانی</th>
                <th className="py-4 px-4">وضعیت حساب</th>
                <th className="py-4 px-4">امنیت (2FA)</th>
                <th className="py-4 px-4">آخرین ورود</th>
                <th className="py-4 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-sm text-slate-600">کاربری با فیلترهای مشخص‌شده یافت نشد.</p>
                    <p className="text-xs text-slate-400 mt-1">عبارت جستجو یا فیلترهای انتخاب‌شده را تغییر دهید.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const isSelected = selectedUserIds.includes(user.id);
                  const isCurrent = currentUser.id === user.id;

                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-indigo-50/30' : ''
                      } ${isCurrent ? 'bg-amber-50/20' : ''}`}
                    >
                      {/* Select checkbox */}
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectUser(user.id)}
                          className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* User Avatar & Name */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="cursor-pointer group relative shrink-0"
                            onClick={() => handleViewProfile(user.id)}
                            title="مشاهده پروفایل کامل"
                          >
                            <Avatar user={user} size="md" />
                            {isCurrent && (
                              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center border border-white" title="حساب فعال شما">
                                من
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleViewProfile(user.id)}
                                className="font-extrabold text-slate-900 hover:text-indigo-600 transition-colors truncate text-right cursor-pointer"
                              >
                                {user.name}
                              </button>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500">
                              <span className="font-mono text-indigo-600 font-bold" dir="ltr">
                                @{user.username || user.email.split('@')[0]}
                              </span>
                              <span>•</span>
                              <span className="truncate">{user.title}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Info */}
                      <td className="py-4 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-700 text-[11px]" dir="ltr">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{user.email}</span>
                          </div>
                          {user.phone && (
                            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-mono" dir="ltr">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{user.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* System Role */}
                      <td className="py-4 px-4">
                        {getRoleBadge(user.roleId, user.role)}
                      </td>

                      {/* Department */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-700 text-xs">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[150px]">{user.department || 'عمومی'}</span>
                        </span>
                      </td>

                      {/* Account Status */}
                      <td className="py-4 px-4">
                        {getStatusBadge(user.status)}
                      </td>

                      {/* 2FA */}
                      <td className="py-4 px-4">
                        {user.twoFactorEnabled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            <KeyRound className="w-3 h-3 text-indigo-600" />
                            <span>فعال</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">غیرفعال</span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="py-4 px-4 text-slate-500 text-[11px]">
                        {user.lastLogin || 'ثبت نشده'}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-center relative">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleViewProfile(user.id)}
                            title="مشاهده پروفایل کامل"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleEditUser(user)}
                            title="ویرایش مشخصات"
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Quick Toggle Status */}
                          <button
                            onClick={() => changeUserStatus(user.id, user.status === 'blocked' ? 'active' : 'blocked')}
                            title={user.status === 'blocked' ? 'رفع مسدودی کاربر' : 'مسدود کردن کاربر'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              user.status === 'blocked'
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            {user.status === 'blocked' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                          </button>

                          {/* Delete */}
                          {!isCurrent && (
                            <button
                              onClick={() => setUserToDelete(user)}
                              title="حذف حساب کاربری"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            نمایش <span className="font-bold text-slate-800">{filteredUsers.length}</span> از{' '}
            <span className="font-bold text-slate-800">{totalCount}</span> کاربر سازمانی
          </span>
          <span className="text-[11px]">سامانه تدبیر • پلتفرم مدیریت متمرکز پروژه‌ها و سازمان</span>
        </div>
      </div>

      {/* Delete Single User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 text-right">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-extrabold text-slate-900 mb-2">
              حذف حساب کاربری
            </h3>
            
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              آیا از حذف حساب کاربری <strong className="text-slate-900">{userToDelete.name}</strong> (@{userToDelete.username || userToDelete.email}) اطمینان دارید؟ تمامی ارتباطات و عضویت‌های این کاربر حذف خواهند شد.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUser(userToDelete.id);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                بله، حذف کاربر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Users Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 text-right">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-extrabold text-slate-900 mb-2">
              حذف گروهی کاربران
            </h3>
            
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              آیا از حذف همزمان <strong className="text-slate-900">{selectedUserIds.length}</strong> کاربر انتخاب‌شده اطمینان دارید؟ این عملیات غیرقابل بازگشت است.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  bulkDeleteUsers(selectedUserIds);
                  setSelectedUserIds([]);
                  setShowBulkDeleteModal(false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                بله، حذف همه موارد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
