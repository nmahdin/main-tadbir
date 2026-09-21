import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SystemRole } from '../../types';
import { SYSTEM_PERMISSIONS } from '../../data/initialData';
import { 
  ShieldCheck, 
  Shield, 
  Plus, 
  Check, 
  X, 
  Lock, 
  Users, 
  Edit, 
  Trash2, 
  Sliders, 
  Info,
  Search,
  Power,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const RoleManagementView: React.FC = () => {
  const { 
    roles, 
    users, 
    toggleRolePermission, 
    toggleRoleStatus,
    deleteRole, 
    openEditRole,
    setIsCreateRoleOpen, 
    setActiveView,
    hasPermission
  } = useApp();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = [
    { key: 'all', label: 'همه دسته‌بندی‌ها' },
    { key: 'users', label: 'کاربران و هویت' },
    { key: 'roles', label: 'نقش‌ها و دسترسی' },
    { key: 'projects', label: 'پروژه‌ها و الگوها' },
    { key: 'tasks', label: 'وظایف و پیشرفت' },
    { key: 'teams', label: 'تیم‌ها و ساختار' },
    { key: 'dam', label: 'دارایی‌های دیجیتال (DAM)' },
    { key: 'messaging', label: 'پیام‌رسان و گفتگوها' },
    { key: 'secretariat', label: 'دبیرخانه و نامه‌ها' },
    { key: 'thinktank', label: 'اتاق فکر و نوآوری' },
    { key: 'reports', label: 'گزارش‌ها و آمار' },
    { key: 'settings', label: 'تنظیمات سامانه' }
  ];

  const filteredPermissions = SYSTEM_PERMISSIONS.filter(p => {
    const matchesCat = activeCategory === 'all' || p.category === activeCategory;
    const matchesSearch = !searchQuery.trim() || 
      p.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getCategoryLabel = (catKey: string) => {
    switch (catKey) {
      case 'users': return 'کاربران';
      case 'roles': return 'نقش‌ها';
      case 'projects': return 'پروژه‌ها';
      case 'tasks': return 'وظایف';
      case 'teams': return 'تیم‌ها';
      case 'dam': return 'دارایی‌های دیجیتال';
      case 'messaging': return 'پیام‌رسان';
      case 'secretariat': return 'دبیرخانه';
      case 'thinktank': return 'اتاق فکر';
      case 'reports': return 'گزارش‌ها';
      case 'settings': return 'تنظیمات';
      default: return catKey;
    }
  };

  const canManagePermissions = hasPermission('roles.manage_permissions');
  const canEditRoles = hasPermission('roles.edit');
  const canCreateRoles = hasPermission('roles.create');
  const canDeleteRoles = hasPermission('roles.delete');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
                مدیریت نقش‌ها و ماتریس دسترسی‌ها (RBAC)
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-extrabold border border-purple-200">
                امنیت سازمانی
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              تعریف نقش‌های سازمانی، تعیین اختیارات و تخصیص بلادرنگ مجوزهای عملیاتی در سراسر سامانه تدبیر
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setActiveView('user-management')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
          >
            <Users className="w-4 h-4 text-indigo-600" />
            <span>مدیریت کاربران و انتساب‌ها</span>
          </button>

          {canCreateRoles && (
            <button
              onClick={() => setIsCreateRoleOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-indigo-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تعریف نقش سازمانی جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {roles.map(role => {
          const userCount = users.filter(u => u.roleId === role.id || u.role === role.key).length;
          const isActive = role.isActive !== false;

          return (
            <div
              key={role.id}
              className={`p-5 rounded-3xl bg-white border shadow-2xs flex flex-col justify-between relative overflow-hidden group hover:border-indigo-300 transition-all ${
                isActive ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50/50 opacity-80'
              }`}
            >
              <div 
                className="absolute top-0 right-0 left-0 h-1.5"
                style={{ backgroundColor: role.color }}
              />

              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-xs"
                      style={{ backgroundColor: role.color }}
                    >
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">{role.name}</h3>
                      <span className="font-mono text-[10px] text-slate-400 block" dir="ltr">
                        {role.key}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {role.isSystem ? (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-400" />
                        سیستمی
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                        سفارشی
                      </span>
                    )}

                    {!isActive && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold">
                        غیرفعال
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">
                  {role.description}
                </p>
              </div>

              <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{userCount} کاربر</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold">
                    {role.permissions.length} مجوز
                  </span>

                  {canEditRoles && (
                    <button
                      onClick={() => openEditRole(role)}
                      title="ویرایش مشخصات نقش"
                      className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {!role.isSystem && canEditRoles && (
                    <button
                      onClick={() => toggleRoleStatus(role.id)}
                      title={isActive ? 'غیرفعال‌سازی نقش' : 'فعال‌سازی مجدد نقش'}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {!role.isSystem && canDeleteRoles && (
                    <button
                      onClick={() => {
                        if (confirm(`آیا از حذف نقش سازمانی "${role.name}" اطمینان دارید؟`)) {
                          deleteRole(role.id);
                        }
                      }}
                      title="حذف نقش سفارشی"
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Permissions Matrix */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Matrix Header & Filters */}
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                ماتریس جامع دسترسی‌های عملیاتی (RBAC Matrix)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                با کلیک روی هر خانه، مجوز دسترسی برای آن نقش فعال یا غیرفعال می‌شود.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="جستجوی عنوان یا کد مجوز..."
                className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Categories Tab Bar */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto bg-slate-50/30">
          {categories.map(cat => {
            const count = cat.key === 'all' 
              ? SYSTEM_PERMISSIONS.length 
              : SYSTEM_PERMISSIONS.filter(p => p.category === cat.key).length;

            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === cat.key
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeCategory === cat.key ? 'bg-indigo-700/80 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-extrabold">
                <th className="p-4 min-w-[260px]">مجوز دسترسی / عملیات سیستم</th>
                <th className="p-4 min-w-[130px]">ماژول / حوزه</th>
                {roles.map(r => (
                  <th key={r.id} className="p-4 text-center min-w-[120px]">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1.5">
                        <span 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: r.color }} 
                        />
                        <span className="font-extrabold text-xs text-slate-900">{r.name}</span>
                      </div>
                      <span className={`text-[10px] mt-0.5 font-bold ${r.isActive !== false ? 'text-slate-400' : 'text-rose-500'}`}>
                        {r.isActive !== false ? `${r.permissions.length} فعال` : 'نقش غیرفعال'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan={roles.length + 2} className="p-8 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    هیچ مجوزی با فیلترهای انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredPermissions.map(perm => {
                  return (
                    <tr key={perm.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Permission Info */}
                      <td className="p-4">
                        <div>
                          <span className="font-extrabold text-slate-900 block">{perm.label}</span>
                          <span className="text-[11px] text-slate-500 block mt-0.5">{perm.description}</span>
                          <code className="text-[10px] font-mono text-indigo-600/80 block mt-0.5" dir="ltr">
                            {perm.id}
                          </code>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold whitespace-nowrap">
                          {getCategoryLabel(perm.category)}
                        </span>
                      </td>

                      {/* Role Checkboxes */}
                      {roles.map(role => {
                        const hasPerm = role.permissions.includes(perm.id);
                        const isSuperAdmin = role.key === 'admin';
                        const isRoleActive = role.isActive !== false;
                        const canToggle = canManagePermissions && !isSuperAdmin;

                        return (
                          <td key={role.id} className="p-4 text-center">
                            <button
                              disabled={!canToggle}
                              onClick={() => toggleRolePermission(role.id, perm.id)}
                              className={`w-7 h-7 rounded-xl mx-auto flex items-center justify-center transition-all ${
                                hasPerm
                                  ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700'
                                  : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                              } ${!canToggle ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${!isRoleActive ? 'opacity-40' : ''}`}
                              title={
                                isSuperAdmin 
                                  ? 'مدیر کل سیستم به تمامی مجوزها دسترسی تام دارد' 
                                  : !canManagePermissions 
                                  ? 'شما مجوز تغییر ماتریس دسترسی را ندارید' 
                                  : hasPerm ? 'کلیک جهت لغو مجوز' : 'کلیک جهت اعطای مجوز'
                              }
                            >
                              {hasPerm ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-3.5 h-3.5 opacity-40" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-600" />
            <span>
              تمام تغییرات در مجوزها به‌صورت بلادرنگ در لایه منطقی و اعتبارسنجی عملیات اعمال می‌گردد.
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-600">
            سامانه تدبیر • معماری امنیت چندسطحی RBAC
          </span>
        </div>
      </div>
    </div>
  );
};
