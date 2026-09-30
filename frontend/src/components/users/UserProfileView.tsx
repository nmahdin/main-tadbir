import { BaleAccountPanel } from '../bale/BaleAccountPanel';
import React, { useState, useRef, useEffect } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { usersApi } from '../../api/users';
import { Avatar } from '../common/Avatar';
import { UserStatus } from '../../types';
import { 
  User, 
  AtSign,
  Phone, 
  MapPin, 
  Calendar, 
  Briefcase, 
  Building2, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  CheckSquare, 
  FolderKanban, 
  Activity, 
  KeyRound, 
  Edit3, 
  ArrowRight, 
  Shield, 
  Sparkles,
  Lock,
  Smartphone,
  Check,
  Camera,
  Bot,
  Bell
} from 'lucide-react';

export const UserProfileView: React.FC = () => {
  const { 
    userProfileId, 
    users, 
    currentUser, 
    projects, 
    tasks, 
    activities, 
    roles, 
    changeUserStatus, 
    setIsEditUserOpen, 
    setUserToEdit, 
    setActiveView, 
    setSelectedTaskId, 
    setSelectedProjectId,
    updateUser,
    updateUserAsync,
    hasPermission
  } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'projects' | 'security' | 'activities' | 'bale'>('overview');
  const [newPassword, setNewPassword] = useState('');
  const [passChangedMsg, setPassChangedMsg] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Target user
  const user = users.find(u => u.id === (userProfileId || currentUser.id)) || currentUser;
  const isSelf = currentUser.id === user.id;

  useEffect(() => { setActiveTab('overview'); }, [user.id]);

  // Filter user's tasks
  const userTasks = tasks.filter(t => t.assigneeId === user.id);
  const completedTasks = userTasks.filter(t => t.status === 'completed');
  const pendingTasks = userTasks.filter(t => !['completed', 'archived'].includes(t.status));

  // Filter user's projects
  const userProjects = projects.filter(p => p.memberIds.includes(user.id) || p.projectManagerId === user.id);

  // Filter user's activities
  const userActivities = activities.filter(a => a.userId === user.id);

  // Find Role details
  const userRole = roles.find(r => r.id === user.roleId || r.key === user.role);

  const handleEdit = () => {
    setUserToEdit(user);
    setIsEditUserOpen(true);
  };

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (!/^\d+$/.test(String(user.id))) {
      alert('آپلود تصویر فقط برای کاربران ثبت‌شده روی سرور ممکن است.');
      return;
    }
    setAvatarUploading(true);
    try {
      const response = await usersApi.uploadAvatar(user.id, file);
      updateUser(user.id, { avatar: response.data.avatar });
    } catch (error) {
      console.error('Uploading avatar failed.', error);
      alert('آپلود تصویر ناموفق بود.');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || passwordSaving) return;
    setPassChangedMsg(false);
    setPasswordError('');
    setPasswordSaving(true);
    try {
      await updateUserAsync(user.id, { temporaryPassword: newPassword });
      setPassChangedMsg(true);
      setNewPassword('');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'تغییر رمز عبور انجام نشد.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right" dir="rtl">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveView(hasPermission('users.view') ? 'user-management' : 'my-tasks')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{hasPermission('users.view') ? 'فهرست کاربران' : 'بازگشت به وظایف من'}</span>
        </button>

        {isSelf && (
          <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200">
            پروفایل حساب کاربری شما
          </span>
        )}
      </div>


      {/* Main Profile Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Cover decorative gradient */}
        <div 
          className="h-32 sm:h-36 w-full relative"
          style={{
            background: `linear-gradient(135deg, ${userRole?.color || '#4f46e5'} 0%, #1e1b4b 100%)`
          }}
        >
          <div className="absolute inset-0 bg-black/10" /><div className="absolute top-6 right-6 text-white"><p className="text-[10px] uppercase tracking-widest opacity-70">TADBIR / PEOPLE</p><p className="text-sm font-bold mt-1">{isSelf ? 'حساب من؛ یک نمای یکپارچه' : 'نمایهٔ همکار'}</p></div>
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold border border-white/30">
              سامانه تدبیر
            </span>
          </div>
        </div>

        {/* Profile Card details */}
        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-14 mb-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-right">
              <div className="relative">
                <Avatar 
                  user={user} 
                  size="xl" 
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl ring-4 ring-white shadow-xl bg-white object-cover" 
                />
                <span 
                  className="absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white"
                  style={{
                    backgroundColor: user.status === 'active' ? '#10b981' : user.status === 'pending' ? '#f59e0b' : '#ef4444'
                  }}
                  title={`وضعیت: ${user.status}`}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute -bottom-1 left-1 w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center shadow-lg border-2 border-white transition-colors cursor-pointer"
                  title="تغییر تصویر پروفایل"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900">{user.name}</h1>
                  <span 
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border"
                    style={{
                      backgroundColor: `${userRole?.color || '#6366f1'}15`,
                      borderColor: `${userRole?.color || '#6366f1'}30`,
                      color: userRole?.color || '#6366f1'
                    }}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>{userRole?.name || user.role}</span>
                  </span>
                </div>

                <p className="text-xs text-slate-500 font-mono" dir="ltr">
                  @{user.username || '—'} • {user.title}
                </p>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center justify-center sm:justify-end gap-2 flex-wrap">
              <button
                onClick={handleEdit}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-200 transition-all cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>ویرایش اطلاعات</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-slate-500 text-[11px] font-bold block mb-0.5">پروژه‌های عضو</span>
              <span className="text-lg font-black text-slate-900">{userProjects.length} پروژه</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-slate-500 text-[11px] font-bold block mb-0.5">تسک‌های تکمیل‌شده</span>
              <span className="text-lg font-black text-emerald-600">{completedTasks.length} تسک</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-slate-500 text-[11px] font-bold block mb-0.5">تسک‌های جاری</span>
              <span className="text-lg font-black text-indigo-600">{pendingTasks.length} تسک</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-slate-500 text-[11px] font-bold block mb-0.5">درصد بار کاری</span>
              <span className="text-lg font-black text-purple-600">{user.workloadPercentage == null ? 'ثبت نشده' : `${user.workloadPercentage.toLocaleString('fa-IR')}٪`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 overflow-x-auto shadow-sm" aria-label="بخش‌های پروفایل">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          اطلاعات فردی و سازمانی
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'tasks'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>تسک‌ها و وظایف</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-current">
            {userTasks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('projects')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'projects'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>پروژه‌های مرتبط</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-current">
            {userProjects.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'security'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          امنیت و احراز هویت
        </button>

        <button
          onClick={() => setActiveTab('activities')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'activities'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          گزارش فعالیت‌های کاربر
        </button>
        {isSelf && <button type="button" aria-pressed={activeTab === 'bale'} onClick={() => setActiveTab('bale')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-colors ${activeTab === 'bale' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-50'}`}>
          <Bot className="w-4 h-4" />اتصال و اعلان‌های بله
        </button>}
      </div>

      {activeTab === 'bale' && isSelf && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><BaleAccountPanel key={user.id} /></div>
        <aside className="rounded-3xl bg-emerald-950 text-white p-6 space-y-5 self-start">
          <Bell className="w-8 h-8 text-emerald-300" /><h3 className="font-bold text-lg">تدبیر، همراه شما در بله</h3>
          <p className="text-sm leading-8 text-emerald-100">وظایف و جلسات را ببینید، گزارش بفرستید و از اعلان‌های جدید باخبر شوید؛ بدون تغییر سطح دسترسی حساب شما.</p>
          <div className="border-t border-white/15 pt-4 text-xs leading-7 text-emerald-100">کد اتصال را فقط برای ربات رسمی وارد کنید. قطع اعلان بله، اعلان‌های داخل تدبیر را متوقف نمی‌کند. ارسال فایل از فرم امن سایت انجام می‌شود.</div>
        </aside>
      </div>}

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bio Card */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">درباره و شرح وظایف</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {user.bio || 'توضیحات و بیوگرافی برای این کاربر ثبت نشده است.'}
              </p>
            </div>

            {/* Contact & Organization */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900">مشخصات تماس و سازمانی</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-2xl bg-slate-50 flex items-center gap-3">
                  <AtSign className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 block">نام کاربری</span>
                    <span className="font-normal text-slate-800 truncate block font-mono" dir="ltr">@{user.username || '—'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 flex items-center gap-3">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-400 block">تلفن همراه</span>
                    <span className="font-bold text-slate-800 font-mono" dir="ltr">{user.phone || 'ثبت نشده'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-400 block">واحد / دپارتمان</span>
                    <span className="font-bold text-slate-800">{user.department || 'سازمانی'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Skills & Competencies */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">مهارت‌ها و حوزه‌های تخصصی</h3>
              <div className="flex flex-wrap gap-2">
                {user.skills && user.skills.length > 0 ? (
                  user.skills.map(skill => (
                    <span
                      key={skill}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold shadow-2xs"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">مهارتی ثبت نشده است.</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Col: Metadata & System Status */}
          <div className="space-y-6">
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900">وضعیت سیستمی</h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                  <span className="text-slate-500">وضعیت حساب:</span>
                  <select
                    value={user.status}
                    onChange={e => changeUserStatus(user.id, e.target.value as UserStatus)}
                    className="font-bold text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer"
                  >
                    <option value="active">فعال</option>
                    <option value="inactive">غیرفعال</option>
                    <option value="pending">در انتظار تأیید</option>
                    <option value="blocked">مسدود</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                  <span className="text-slate-500">تاریخ عضویت:</span>
                  <span className="font-bold text-slate-800 font-mono" dir="ltr">{formatPersianDate(user.createdAt) || '۱۴۰۳/۰۱/۱۵'}</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                  <span className="text-slate-500">آخرین ورود به سامانه:</span>
                  <span className="font-bold text-slate-800">{user.lastLogin || 'همین امروز'}</span>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <h3 className="text-sm font-extrabold text-slate-900">
              تسک‌های محول‌شده به {user.name} ({userTasks.length} تسک)
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {userTasks.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                تسکی به این کاربر تخصیص داده نشده است.
              </div>
            ) : (
              userTasks.map(task => {
                const project = projects.find(p => p.id === task.projectId);
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-900 block truncate">
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-bold text-indigo-600">{project?.name || 'پروژه'}</span>
                          <span>•</span>
                          <span>مهلت: {formatPersianDate(task.deadline)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        task.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        task.status === 'in_progress' ? 'bg-indigo-50 text-indigo-700' :
                        task.status === 'review' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {task.status === 'completed' ? 'تکمیل شده' :
                         task.status === 'in_progress' ? 'در حال انجام' :
                         task.status === 'review' ? 'بازبینی' : 'در انتظار'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {userProjects.map(p => (
            <div
              key={p.id}
              onClick={() => {
                setSelectedProjectId(p.id);
                setActiveView('project-detail');
              }}
              className="p-5 rounded-3xl bg-white border border-slate-200 shadow-2xs hover:border-indigo-300 transition-all cursor-pointer group space-y-4"
            >
              <div className="flex items-center justify-between">
                <span 
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono"
                  style={{ backgroundColor: `${p.color}15`, color: p.color }}
                >
                  {p.key}
                </span>
                <span className="text-xs font-bold text-slate-700">{p.progress}٪ پیشرفت</span>
              </div>

              <div>
                <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {p.name}
                </h4>
                <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                  {p.description}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${p.progress}%`, backgroundColor: p.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="max-w-2xl space-y-6">
          {/* Password Reset simulation */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  تغییر رمز عبور کاربر
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تعریف گذرواژه جدید برای ورود به سامانه تدبیر
                </p>
              </div>
            </div>

            {passChangedMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>رمز عبور با موفقیت به‌روزرسانی شد.</span>
              </div>
            )}

            {passwordError && <p role="alert" className="text-xs text-rose-700">{passwordError}</p>}
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رمز عبور جدید
                </label>
                <input
                  type="password"
                  required minLength={8} disabled={passwordSaving}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="حداقل ۸ کاراکتر ترکیبی..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                />
              </div>

              <button
                type="submit" disabled={passwordSaving}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors"
              >
                {passwordSaving ? 'در حال ذخیره…' : 'ذخیره رمز عبور جدید'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* User Activity Tab */}
      {activeTab === 'activities' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            <span>لاگ فعالیت‌ها و اقدامات ثبت‌شده توسط {user.name}</span>
          </h3>

          <div className="space-y-3">
            {userActivities.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                هنوز فعالیتی توسط این کاربر ثبت نشده است.
              </p>
            ) : (
              userActivities.map(act => (
                <div
                  key={act.id}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3 text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-indigo-600 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900">{act.action}</p>
                    {act.details && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{act.details}</p>
                    )}
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {new Date(act.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })} • {new Date(act.timestamp).toLocaleDateString('fa-IR')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
