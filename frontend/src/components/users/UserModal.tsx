import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { User, UserStatus, Role } from '../../types';
import {
  X,
  User as UserIcon,
  Phone,
  Briefcase,
  Building2,
  ShieldCheck,
  Lock,
  Check,
  Plus,
  Camera,
  Trash2,
  Loader2
} from 'lucide-react';

export const UserModal: React.FC = () => {
  const {
    isCreateUserOpen,
    setIsCreateUserOpen,
    isEditUserOpen,
    setIsEditUserOpen,
    userToEdit,
    setUserToEdit,
    addUserAsync,
    updateUserAsync,
    deleteUser,
    roles, departments, hasPermission
  } = useApp();

  const isOpen = isCreateUserOpen || isEditUserOpen;
  const isEditing = isEditUserOpen && !!userToEdit;
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    phone: '',
    title: '',
    department: '',
    departmentId: '',
    role: 'team_member' as Role,
    roleId: '',
    status: 'active' as UserStatus,
    skills: [] as string[],
    newSkillInput: '',
    temporaryPassword: '',
    passwordConfirmation: '',
    bio: '',
    avatar: ''
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usernameFallback = (user?: User | null) => {
    if (!user) return '';
    if (user.username) return user.username;
    return '';
  };

  useEffect(() => {
    if (isEditing && userToEdit) {
      setFormData({
        name: userToEdit.name || '',
        username: usernameFallback(userToEdit),
        phone: userToEdit.phone || '',
        title: userToEdit.title || '',
        department: userToEdit.department || '',
        departmentId: userToEdit.departmentId || '',
        role: userToEdit.role || 'team_member',
        roleId: (() => {
          if (userToEdit.roleId && roles.some(r => r.id === userToEdit.roleId)) return userToEdit.roleId;
          const byKey = roles.find(r => r.key === userToEdit.role);
          if (byKey) return byKey.id;
          return roles[0]?.id || '';
        })(),
        status: userToEdit.status || 'active',
        skills: userToEdit.skills || ['همکاری تیمی', 'سامانه تدبیر'],
        newSkillInput: '',
        temporaryPassword: '',
        passwordConfirmation: '',
        bio: userToEdit.bio || '',
        avatar: userToEdit.avatar && !userToEdit.avatar.startsWith('blob:') ? userToEdit.avatar : ''
      });
      setAvatarPreview(userToEdit.avatar || '');
    } else {
      setFormData({
        name: '',
        username: '',
        phone: '',
        title: '',
        department: '',
        departmentId: '',
        role: (roles.find(r => r.key === 'team_member')?.key || roles[0]?.key || 'team_member') as Role,
        roleId: roles.find(r => r.key === 'team_member')?.id || roles[0]?.id || '',
        status: 'active',
        skills: [],
        newSkillInput: '',
        temporaryPassword: '',
        passwordConfirmation: '',
        bio: '',
        avatar: ''
      });
      setAvatarPreview('');
    }
    setAvatarFile(null);
    setSubmitError('');
  }, [isEditing, userToEdit, isOpen, roles]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsCreateUserOpen(false);
    setIsEditUserOpen(false);
    setUserToEdit(null);
    setAvatarFile(null);
    setAvatarPreview('');
    setSubmitError('');
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSubmitError('لطفاً فقط فایل تصویری (JPG یا PNG) انتخاب کنید.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError('حجم تصویر نباید بیشتر از ۵ مگابایت باشد.');
      return;
    }
    setSubmitError('');
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview('');
    setFormData(prev => ({ ...prev, avatar: '' }));
    if (avatarInputRef.current) avatarInputRef.current.value = '';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!formData.name.trim()) {
      setSubmitError('نام و نام خانوادگی الزامی است.');
      return;
    }
    if (!formData.username.trim()) {
      setSubmitError('نام کاربری الزامی است.');
      return;
    }
    if (!isEditing && !formData.temporaryPassword) {
      setSubmitError('رمز عبور اولیه برای کاربر جدید الزامی است.');
      return;
    }
    if (formData.temporaryPassword && [...formData.temporaryPassword].length < 8) {
      setSubmitError('رمز عبور باید حداقل ۸ نویسه باشد.');
      return;
    }
    if (formData.temporaryPassword && formData.temporaryPassword !== formData.passwordConfirmation) {
      setSubmitError('رمز عبور و تکرار آن یکسان نیستند.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const username = formData.username.trim().toLowerCase();

    try {
      if (isEditing && userToEdit) {
        await updateUserAsync(userToEdit.id, {
        name: formData.name.trim(),
        username,
        phone: formData.phone.trim(),
        title: formData.title.trim(),
        department: departments.find(d => d.id === formData.departmentId)?.name || '',
        departmentId: formData.departmentId || null,
        role: formData.role,
        roleId: formData.roleId,
        status: formData.status,
        skills: formData.skills,
        temporaryPassword: formData.temporaryPassword || undefined,
        bio: formData.bio,
        avatar: avatarPreview && !avatarPreview.startsWith('blob:') ? avatarPreview : userToEdit.avatar,
          avatarFile
        } as Partial<User> & { avatarFile?: File | null });
      } else {
        await addUserAsync({
        name: formData.name.trim(),
        username,
        phone: formData.phone.trim() || '۰۹۱۲۰۰۰۰۰۰۰',
        title: formData.title.trim() || 'عضو سازمانی',
        department: departments.find(d => d.id === formData.departmentId)?.name || '',
        departmentId: formData.departmentId || null,
        role: formData.role,
        roleId: formData.roleId,
        status: formData.status,
        skills: formData.skills,
        temporaryPassword: formData.temporaryPassword,
        bio: formData.bio,
          avatar: '',
          avatarFile
        });
      }
      handleClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'عملیات ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setIsSubmitting(false);
    }
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
          {/* Avatar upload */}
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="relative shrink-0">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="تصویر پروفایل"
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-400">
                  <UserIcon className="w-7 h-7" />
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1.5 -left-1.5 w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md transition-colors cursor-pointer"
                title="آپلود تصویر پروفایل"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-extrabold text-slate-800">تصویر پروفایل</p>
              <p className="text-[11px] text-slate-500 mt-0.5">JPG یا PNG تا ۵ مگابایت</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                >
                  انتخاب تصویر
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-rose-600 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    حذف تصویر
                  </button>
                )}
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

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
                  aria-label="نام و نام خانوادگی"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder=""
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                نام کاربری سازمانی <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="text-xs font-bold text-slate-400 absolute right-3.5 top-2.5">@</span>
                <input
                  type="text"
                  required
                  aria-label="نام کاربری سازمانی"
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
          </div>

          {/* Organizational Role & Department */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                واحد / دپارتمان سازمانی
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <select
                  disabled={!hasPermission('departments.manage_members')}
                  value={formData.departmentId}
                  onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer"
                >
                  <option value="">انتخاب دپارتمان</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name} (#{d.id})</option>)}
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
                <option value="pending">در انتظار تأیید</option>
                <option value="blocked">مسدود شده (ممنوع‌الورود)</option>
              </select>
            </div>
          </div>

          {/* Role */}
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

          {/* Password */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <div>
                <span className="text-xs font-extrabold text-slate-800">
                  {isEditing ? 'تغییر رمز عبور (اختیاری)' : 'رمز عبور اولیه'}
                </span>
                <p className="text-[11px] text-slate-500">
                  {isEditing ? 'برای حفظ رمز فعلی، این فیلدها را خالی بگذارید' : 'کاربر در ورود اول می‌تواند رمز خود را تغییر دهد'}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-indigo-100/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isEditing ? 'رمز عبور جدید' : 'رمز عبور اولیه'}
                </label>
                <input
                  type="password"
                  required={!isEditing}
                  aria-label="رمز عبور"
                  minLength={8}
                  value={formData.temporaryPassword}
                  onChange={e => setFormData({ ...formData, temporaryPassword: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white border border-indigo-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تکرار رمز عبور</label>
                <input
                  type="password"
                  required={!isEditing || !!formData.temporaryPassword}
                  aria-label="تکرار رمز عبور"
                  value={formData.passwordConfirmation}
                  onChange={e => setFormData({ ...formData, passwordConfirmation: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white border border-indigo-200 rounded-xl text-xs"
                />
              </div>
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
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
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
                    className="text-slate-400 hover:text-rose-500 cursor-pointer"
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

          {submitError && (
            <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
              {submitError}
            </p>
          )}
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
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 disabled:cursor-wait text-white text-xs font-bold shadow-md shadow-indigo-200 flex items-center gap-2 transition-all cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{isSubmitting ? 'در حال ثبت...' : isEditing ? 'ذخیره تغییرات' : 'ثبت کاربر در سامانه تدبیر'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
