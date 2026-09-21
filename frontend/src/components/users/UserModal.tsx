import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { User, UserStatus, Role } from '../../types';
import { 
  X, 
  User as UserIcon, 
  Mail, 
  Phone, 
  Briefcase, 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Sparkles, 
  Check, 
  Plus,
  KeyRound
} from 'lucide-react';

export const UserModal: React.FC = () => {
  const { 
    isCreateUserOpen, 
    setIsCreateUserOpen, 
    isEditUserOpen, 
    setIsEditUserOpen, 
    userToEdit, 
    setUserToEdit, 
    addUser, 
    updateUser, 
    deleteUser,
    roles 
  } = useApp();

  const isOpen = isCreateUserOpen || isEditUserOpen;
  const isEditing = isEditUserOpen && !!userToEdit;

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    title: '',
    department: 'دپارتمان مهندسی نرم‌افزار',
    role: 'team_member' as Role,
    roleId: 'role-member',
    status: 'active' as UserStatus,
    skills: [] as string[],
    newSkillInput: '',
    twoFactorEnabled: false,
    temporaryPassword: '',
    passwordConfirmation: '',
    bio: ''
  });

  useEffect(() => {
    if (isEditing && userToEdit) {
      setFormData({
        name: userToEdit.name || '',
        username: userToEdit.username || userToEdit.email.split('@')[0] || '',
        email: userToEdit.email || '',
        phone: userToEdit.phone || '',
        title: userToEdit.title || '',
        department: userToEdit.department || 'دپارتمان مهندسی نرم‌افزار',
        role: userToEdit.role || 'team_member',
        roleId: userToEdit.roleId || (userToEdit.role === 'admin' ? 'role-admin' : userToEdit.role === 'project_manager' ? 'role-pm' : 'role-member'),
        status: userToEdit.status || 'active',
        skills: userToEdit.skills || ['همکاری تیمی', 'سامانه تدبیر'],
        newSkillInput: '',
        twoFactorEnabled: userToEdit.twoFactorEnabled || false,
        temporaryPassword: '',
        passwordConfirmation: '',
        bio: userToEdit.bio || ''
      });
    } else {
      setFormData({
        name: '',
        username: '',
        email: '',
        phone: '',
        title: '',
        department: '',
        role: 'team_member',
        roleId: 'role-member',
        status: 'active',
        skills: [],
        newSkillInput: '',
        twoFactorEnabled: false,
        temporaryPassword: '',
        passwordConfirmation: '',
        bio: ''
      });
    }
  }, [isEditing, userToEdit, isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsCreateUserOpen(false);
    setIsEditUserOpen(false);
    setUserToEdit(null);
  };

  const handleAddSkill = () => {
    if (formData.newSkillInput.trim() && !formData.skills.includes(formData.newSkillInput.trim())) {
      setFormData(prev => ({
        ...prev,
        skills: [...prev.skills, prev.newSkillInput.trim()],
        newSkillInput: ''
      }));
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skillToRemove)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || (!isEditing && !formData.temporaryPassword)) {
      return;
    }

    if (formData.temporaryPassword && formData.temporaryPassword !== formData.passwordConfirmation) return;

    if (isEditing && userToEdit) {
      updateUser(userToEdit.id, {
        name: formData.name,
        username: formData.username.trim() || undefined,
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        title: formData.title.trim(),
        department: formData.department,
        role: formData.role,
        roleId: formData.roleId,
        status: formData.status,
        skills: formData.skills,
        twoFactorEnabled: formData.twoFactorEnabled,
        temporaryPassword: formData.temporaryPassword || undefined,
        bio: formData.bio
      });
    } else {
      addUser({
        name: formData.name,
        username: formData.username.trim() || formData.email.split('@')[0],
        email: formData.email.trim(),
        phone: formData.phone.trim() || '۰۹۱۲۰۰۰۰۰۰۰',
        title: formData.title.trim() || 'عضو سازمانی',
        department: formData.department,
        role: formData.role,
        roleId: formData.roleId,
        status: formData.status,
        skills: formData.skills,
        twoFactorEnabled: formData.twoFactorEnabled,
        temporaryPassword: formData.temporaryPassword,
        bio: formData.bio
      });
    }

    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden text-right" dir="rtl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                {isEditing ? 'ویرایش اطلاعات کاربر' : 'افزودن کاربر جدید به سامانه تدبیر'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing ? 'به‌روزرسانی مشخصات و سطح دسترسی کاربر' : 'ایجاد حساب کاربری سازمانی و تنظیم نقش'}
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Personal Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                نام و نام خانوادگی <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder=""
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                نام کاربری سازمانی
              </label>
              <div className="relative">
                <span className="text-xs font-bold text-slate-400 absolute right-3.5 top-2.5">@</span>
                <input
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })}
                  placeholder=""
                  className="w-full pr-8 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all text-left font-mono"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                پست الکترونیکی سازمانی <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder=""
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                شماره تلفن همراه
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder=""
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all text-left font-mono"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* Organizational Role & Department */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                عنوان شغلی / سمت سازمانی
              </label>
              <div className="relative">
                <Briefcase className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder=""
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                واحد / دپارتمان سازمانی
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <select
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer"
                >
                  <option value="">انتخاب دپارتمان</option>
                  <option value="دپارتمان مهندسی نرم‌افزار">دپارتمان مهندسی نرم‌افزار</option>
                  <option value="دپارتمان طراحی محصول و تجربه کاربری (UI/UX)">دپارتمان طراحی محصول و تجربه کاربری (UI/UX)</option>
                  <option value="دپارتمان زیرساخت و DevOps">دپارتمان زیرساخت و DevOps</option>
                  <option value="دپارتمان تضمین کیفیت (QA)">دپارتمان تضمین کیفیت (QA)</option>
                  <option value="دپارتمان داده و هوش مصنوعی">دپارتمان داده و هوش مصنوعی</option>
                  <option value="دپارتمان بازاریابی و رشد">دپارتمان بازاریابی و رشد</option>
                  <option value="مدیریت ارشد و اجرایی">مدیریت ارشد و اجرایی</option>
                </select>
              </div>
            </div>
          </div>

          {/* Role & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                نقش و سطح دسترسی سیستمی
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <select
                  value={formData.roleId}
                  onChange={e => {
                    const selectedRole = roles.find(r => r.id === e.target.value);
                    setFormData({ 
                      ...formData, 
                      roleId: e.target.value,
                      role: selectedRole ? (selectedRole.key as Role) : 'team_member'
                    });
                  }}
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer font-bold"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.isSystem ? '(سیستمی)' : '(سفارشی)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                وضعیت حساب کاربری
              </label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as UserStatus })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer font-bold"
              >
                <option value="active">فعال (دارای دسترسی کامل به پروژه‌ها)</option>
                <option value="inactive">غیرفعال (موقت)</option>
                <option value="pending">در انتظار تأیید مدارک / ایمیل</option>
                <option value="blocked">مسدود شده (ممنوع‌الورود)</option>
              </select>
            </div>
          </div>

          {/* Security & 2FA */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <div>
                  <span className="text-xs font-extrabold text-slate-800">احراز هویت دو مرحله‌ای (2FA)</span>
                  <p className="text-[11px] text-slate-500">ارسال کد امنیتی پیامکی یا تولیدکننده کد در زمان ورود</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.twoFactorEnabled}
                  onChange={e => setFormData({ ...formData, twoFactorEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="pt-3 border-t border-indigo-100/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-700 mb-1">{isEditing ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور اولیه'}</label><input type="password" required={!isEditing} value={formData.temporaryPassword} onChange={e => setFormData({ ...formData, temporaryPassword: e.target.value })} className="w-full px-3.5 py-2 bg-white border border-indigo-200 rounded-xl text-xs" /></div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">تکرار رمز عبور</label><input type="password" required={!isEditing || !!formData.temporaryPassword} value={formData.passwordConfirmation} onChange={e => setFormData({ ...formData, passwordConfirmation: e.target.value })} className="w-full px-3.5 py-2 bg-white border border-indigo-200 rounded-xl text-xs" /></div>
            </div>
          </div>

          {/* Skills tags */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              مهارت‌ها و تخصص‌ها
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={formData.newSkillInput}
                onChange={e => setFormData({ ...formData, newSkillInput: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder=""
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {formData.skills.map(skill => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              بیوگرافی و یادداشت سازمانی
            </label>
            <textarea
              rows={2}
              value={formData.bio}
              onChange={e => setFormData({ ...formData, bio: e.target.value })}
              placeholder=""
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              انصراف
            </button>
            {isEditing && userToEdit && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`آیا از حذف حساب کاربری "${userToEdit.name}" اطمینان دارید؟`)) {
                    deleteUser(userToEdit.id);
                    handleClose();
                  }
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                حذف کاربر
              </button>
            )}
          </div>
          <button
            onClick={handleSubmit}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-md shadow-indigo-200 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isEditing ? 'ذخیره تغییرات' : 'ثبت کاربر در سامانه تدبیر'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
