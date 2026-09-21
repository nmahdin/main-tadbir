import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SystemRole } from '../../types';
import { SYSTEM_PERMISSIONS } from '../../data/initialData';
import { X, Shield, Check, Palette, Sparkles, AlertTriangle } from 'lucide-react';

const COLOR_OPTIONS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#0ea5e9', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#ef4444', // Red
  '#64748b'  // Slate
];

export const RoleModal: React.FC = () => {
  const { 
    isCreateRoleOpen, 
    setIsCreateRoleOpen, 
    isEditRoleOpen, 
    setIsEditRoleOpen, 
    roleToEdit, 
    setRoleToEdit, 
    addRole, 
    updateRole 
  } = useApp();

  const isOpen = isCreateRoleOpen || isEditRoleOpen;
  const isEditing = Boolean(isEditRoleOpen && roleToEdit);

  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
    color: '#6366f1',
    isActive: true,
    permissions: ['users.view', 'projects.view', 'tasks.view']
  });

  useEffect(() => {
    if (isEditing && roleToEdit) {
      setFormData({
        name: roleToEdit.name,
        key: roleToEdit.key,
        description: roleToEdit.description || '',
        color: roleToEdit.color || '#6366f1',
        isActive: roleToEdit.isActive !== false,
        permissions: roleToEdit.permissions || []
      });
    } else if (isCreateRoleOpen) {
      setFormData({
        name: '',
        key: '',
        description: '',
        color: '#6366f1',
        isActive: true,
        permissions: ['users.view', 'projects.view', 'tasks.view']
      });
    }
  }, [isEditing, roleToEdit, isCreateRoleOpen, isEditRoleOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsCreateRoleOpen(false);
    setIsEditRoleOpen(false);
    setRoleToEdit(null);
  };

  const handleTogglePermission = (permId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }));
  };

  const handleSelectAllCategory = (category: string) => {
    const catPerms = SYSTEM_PERMISSIONS.filter(p => p.category === category).map(p => p.id);
    const allSelected = catPerms.every(id => formData.permissions.includes(id));

    if (allSelected) {
      setFormData(prev => ({
        ...prev,
        permissions: prev.permissions.filter(id => !catPerms.includes(id))
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        permissions: Array.from(new Set([...prev.permissions, ...catPerms]))
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (isEditing && roleToEdit) {
      updateRole(roleToEdit.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color,
        isActive: formData.isActive,
        permissions: formData.permissions
      });
    } else {
      const generatedKey = formData.key.trim() || formData.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      addRole({
        name: formData.name.trim(),
        key: generatedKey,
        description: formData.description.trim() || 'نقش سازمانی سامانه تدبیر',
        color: formData.color,
        isActive: formData.isActive,
        permissions: formData.permissions
      });
    }

    handleClose();
  };

  const categories = [
    { key: 'users', label: 'مدیریت کاربران و احراز هویت' },
    { key: 'roles', label: 'مدیریت نقش‌ها و ماتریس دسترسی' },
    { key: 'projects', label: 'مدیریت پروژه‌ها و الگوها' },
    { key: 'tasks', label: 'مدیریت وظایف و ورک‌فلو' },
    { key: 'teams', label: 'مدیریت تیم‌ها و ساختار' },
    { key: 'dam', label: 'دارایی‌های دیجیتال (DAM)' },
    { key: 'messaging', label: 'پیام‌رسان و ارتباطات' },
    { key: 'secretariat', label: 'دبیرخانه و مکاتبات اداری' },
    { key: 'thinktank', label: 'اتاق فکر و ایده‌پردازی' },
    { key: 'reports', label: 'گزارش‌گیری و تحلیل داده' },
    { key: 'settings', label: 'تنظیمات و پیکربندی' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden text-right" dir="rtl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm"
              style={{ backgroundColor: formData.color }}
            >
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  {isEditing ? `ویرایش مشخصات نقش: ${roleToEdit?.name}` : 'تعریف نقش جدید در سامانه تدبیر'}
                </h2>
                {roleToEdit?.isSystem && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-extrabold border border-amber-200">
                    نقش سیستمی
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEditing ? 'به‌روزرسانی عنوان، توضیحات، وضعیت فعالیت و سطح دسترسی‌های این نقش' : 'مشخص کردن عنوان نقش، کلید سیستمی و اعطای مجوزهای دسترسی دانه‌بندی‌شده'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                عنوان نقش سازمانی <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: مدیر فنی / کارشناس ارشد محصول"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                شناسه سیستمی (انگلیسی)
              </label>
              <input
                type="text"
                disabled={isEditing}
                value={formData.key}
                onChange={e => setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                placeholder="مثال: tech_lead"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all font-mono text-left disabled:opacity-60 disabled:bg-slate-100"
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                توضیحات و دامنه وظایف نقش
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="توضیح کوتاه در مورد هدف و حوزه مسئولیت این نقش..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                وضعیت فعالیت در سیستم
              </label>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs font-bold ${formData.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {formData.isActive ? 'فعال و عملیاتی' : 'غیرفعال (معلق)'}
                </span>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${formData.isActive ? 'bg-emerald-600' : 'bg-slate-300'}`}
                >
                  <span
                    className={`absolute top-1 right-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      formData.isActive ? '-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                در صورت غیرفعال بودن، کاربران دارای این نقش دسترسی‌های سیستمی نخواهند داشت.
              </p>
            </div>
          </div>

          {/* Color theme */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-slate-500" />
              <span>رنگ نشانگر نقش در نمودارها و برچسب‌ها</span>
            </label>
            <div className="flex flex-wrap gap-2.5">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: c })}
                  className={`w-7 h-7 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                    formData.color === c ? 'ring-3 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {formData.color === c && <Check className="w-4 h-4 text-white drop-shadow-xs" />}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Matrix Picker */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl">
              <div>
                <span className="text-xs font-extrabold text-indigo-950 block">
                  مجوزهای دسترسی به بخش‌های سامانه ({formData.permissions.length} از {SYSTEM_PERMISSIONS.length} مجوز فعال است)
                </span>
                <span className="text-[11px] text-indigo-700/80 mt-0.5 block">
                  دسترسی‌ها به تفکیک ماژول‌های سامانه تدبیر طبقه‌بندی شده‌اند.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, permissions: SYSTEM_PERMISSIONS.map(p => p.id) }))}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer transition-colors"
                >
                  انتخاب تمامی مجوزها
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, permissions: [] }))}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-bold cursor-pointer transition-colors"
                >
                  لغو انتخاب همه
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories.map(cat => {
                const catPerms = SYSTEM_PERMISSIONS.filter(p => p.category === cat.key);
                if (catPerms.length === 0) return null;
                const allSelected = catPerms.every(p => formData.permissions.includes(p.id));
                const someSelected = catPerms.some(p => formData.permissions.includes(p.id));

                return (
                  <div key={cat.key} className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-2.5 hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-900">{cat.label}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                          {catPerms.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectAllCategory(cat.key)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                      >
                        {allSelected ? 'لغو انتخاب' : 'انتخاب همه'}
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {catPerms.map(perm => {
                        const isChecked = formData.permissions.includes(perm.id);
                        return (
                          <label
                            key={perm.id}
                            className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-white border-indigo-200 shadow-2xs'
                                : 'bg-slate-100/50 border-transparent hover:bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePermission(perm.id)}
                              className="mt-0.5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-bold text-slate-800 block">
                                {perm.label}
                              </span>
                              <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                                {perm.description}
                              </span>
                              <code className="text-[9px] font-mono text-indigo-600/70 block mt-0.5" dir="ltr">
                                {perm.id}
                              </code>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            انصراف
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-md shadow-indigo-200 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isEditing ? 'ذخیره تغییرات نقش' : 'ایجاد و ثبت نقش سازمانی'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

