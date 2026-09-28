import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProcessTemplateModal } from './ProcessTemplateModal';
import { ContentProcessTemplate } from '../../types';
import {
  Settings,
  Building,
  Shield,
  Bell,
  Save,
  RotateCcw,
  CheckCircle2,
  Lock,
  Users,
  ShieldCheck,
  ArrowLeft,
  Tags,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  FolderPlus,
  Globe,
  Layers,
  ListFilter,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Server
} from 'lucide-react';

type SettingsTab = 'general' | 'notifications' | 'security' | 'priorities' | 'content';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'عمومی و سازمانی', icon: <Building className="w-4 h-4" /> },
  { id: 'notifications', label: 'اعلان‌ها و هشدارها', icon: <Bell className="w-4 h-4" /> },
  { id: 'security', label: 'امنیت و احراز هویت', icon: <Lock className="w-4 h-4" /> },
  { id: 'priorities', label: 'اولویت‌های وظایف', icon: <ListFilter className="w-4 h-4" /> },
  { id: 'content', label: 'محتوا و فرایند', icon: <Layers className="w-4 h-4" /> },
];

const TIMEZONES = [
  { value: 'Asia/Tehran', label: 'تهران (UTC+3:30)' },
  { value: 'Asia/Dubai', label: 'دبی (UTC+4)' },
  { value: 'Europe/Berlin', label: 'برلین (UTC+1)' },
  { value: 'Europe/London', label: 'لندن (UTC+0)' },
  { value: 'UTC', label: 'UTC' },
];

const SPRINT_LENGTHS = [
  { value: '1 week', label: 'اسپرینت‌های ۱ هفته‌ای' },
  { value: '2 weeks', label: 'اسپرینت‌های ۲ هفته‌ای (استاندارد)' },
  { value: '3 weeks', label: 'اسپرینت‌های ۳ هفته‌ای' },
  { value: '4 weeks', label: 'اسپرینت‌های ۴ هفته‌ای (ماهانه)' },
];

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    setActiveView,
    roles,
    users,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    contentTypes,
    addContentType,
    deleteContentType,
    publishingPlatforms,
    updatePublishingPlatforms,
    processTemplates,
    addProcessTemplate,
    updateProcessTemplate,
    deleteProcessTemplate,
    resetCategories,
    hasPermission,
    // تنظیمات پویا
    generalSettings,
    setGeneralSettings,
    notificationSettings,
    setNotificationSettings,
    securitySettings,
    setSecuritySettings,
    taskPriorities,
    setTaskPriorities,
    settingsSaveState,
    settingsSaveError,
    saveSettingsNow,
    notify,
  } = useApp();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // فقط مدیر سیستم یا دارندگان مجوزهای مدیریت پیکربندی می‌توانند تغییر دهند.
  const canEdit = currentUser.role === 'admin'
    || hasPermission('settings.manage')
    || hasPermission('content.manage_process')
    || hasPermission('workflows.manage');

  const [isSavingNow, setIsSavingNow] = useState(false);

  const handleManualSave = async () => {
    setIsSavingNow(true);
    const ok = await saveSettingsNow();
    setIsSavingNow(false);
    if (ok) {
      notify({ type: 'success', title: 'تنظیمات ذخیره شد', message: 'همه بخش‌های تنظیمات روی سرور ذخیره شد.' });
    }
  };

  // Process Templates State
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [editingProcessTemplate, setEditingProcessTemplate] = useState<ContentProcessTemplate | null>(null);

  // Platform Management State
  const [newPlatformName, setNewPlatformName] = useState('');
  const [newPlatformCategory, setNewPlatformCategory] = useState('messaging');
  const [newPlatformHandle, setNewPlatformHandle] = useState('');
  const [newPlatformIcon, setNewPlatformIcon] = useState('globe');

  // Category Management State
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCatIndex, setEditingCatIndex] = useState<number | null>(null);
  const [editingCatValue, setEditingCatValue] = useState('');

  // Content Types State
  const [newContentTypeInput, setNewContentTypeInput] = useState('');

  const handleAddContentType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContentTypeInput.trim()) return;
    addContentType(newContentTypeInput.trim());
    setNewContentTypeInput('');
  };

  const handleAddPlatform = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlatformName.trim()) return;
    const newPlat = {
      id: `plat-${Date.now()}`,
      name: newPlatformName.trim(),
      category: newPlatformCategory as any,
      iconName: newPlatformIcon,
      color: '#6366f1',
      defaultHandle: newPlatformHandle.trim() || undefined,
      isEnabled: true
    };
    updatePublishingPlatforms([...publishingPlatforms, newPlat]);
    setNewPlatformName('');
    setNewPlatformHandle('');
    setNewPlatformIcon('globe');
  };

  const handleTogglePlatform = (id: string) => {
    updatePublishingPlatforms(
      publishingPlatforms.map(p => p.id === id ? { ...p, isEnabled: !p.isEnabled } : p)
    );
  };

  const handleDeletePlatform = (id: string, name: string) => {
    if (confirm(`آیا از حذف پلتفرم انتشار «${name}» اطمینان دارید؟`)) {
      updatePublishingPlatforms(publishingPlatforms.filter(p => p.id !== id));
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatInput.trim()) return;
    addCategory(newCatInput.trim());
    setNewCatInput('');
  };

  const startEditCategory = (index: number, cat: string) => {
    setEditingCatIndex(index);
    setEditingCatValue(cat);
  };

  const saveEditCategory = (oldCat: string) => {
    if (editingCatValue.trim() && editingCatValue.trim() !== oldCat) {
      updateCategory(oldCat, editingCatValue.trim());
    }
    setEditingCatIndex(null);
    setEditingCatValue('');
  };

  /** نشانگر وضعیت ذخیره‌سازی تنظیمات روی سرور. */
  const SaveStateBadge: React.FC = () => {
    if (settingsSaveState === 'saving' || isSavingNow) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] font-bold text-indigo-700">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          در حال ذخیره روی سرور...
        </span>
      );
    }
    if (settingsSaveState === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          خطا در ذخیره‌سازی
        </span>
      );
    }
    if (settingsSaveState === 'saved') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          ذخیره شد
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-500">
        <Server className="w-3.5 h-3.5" />
        ذخیره خودکار فعال
      </span>
    );
  };

  const readOnlyNotice = !canEdit && (
    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-bold flex items-center gap-2">
      <Shield className="w-4 h-4 shrink-0" />
      <span>شما اجازه ویرایش تنظیمات را ندارید؛ موارد زیر فقط قابل مشاهده است. برای تغییر، مجوز «مدیریت پیکربندی و تنظیمات سامانه» لازم است.</span>
    </div>
  );

  const disabledAttr = canEdit ? {} : { disabled: true };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 text-right" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-indigo-600" />
            <span>تنظیمات عمومی سامانه تدبیر</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            پیکربندی هویت سازمان، اعلان‌ها، امنیت، اولویت‌ها و فرایندهای محتوایی — همه روی سرور ذخیره می‌شود
          </p>
        </div>
        <SaveStateBadge />
      </div>

      {settingsSaveState === 'error' && settingsSaveError && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
          <p className="text-xs font-extrabold text-rose-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            ذخیره‌سازی تنظیمات با خطا مواجه شد
          </p>
          <p className="text-xs text-rose-800 leading-relaxed">{settingsSaveError}</p>
          <button
            type="button"
            onClick={handleManualSave}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            تلاش مجدد برای ذخیره
          </button>
        </div>
      )}

      {/* Quick shortcuts to User & Role management */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => setActiveView('user-management')}
          className="p-5 rounded-3xl bg-gradient-to-br from-indigo-50/80 to-white border border-indigo-100 hover:border-indigo-300 shadow-2xs cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                مدیریت کاربران و دسترسی‌ها
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {users.length} کاربر ثبت‌شده در سامانه تدبیر
              </p>
            </div>
          </div>
          <ArrowLeft className="w-5 h-5 text-indigo-600 group-hover:-translate-x-1 transition-transform" />
        </div>

        <div
          onClick={() => setActiveView('roles-management')}
          className="p-5 rounded-3xl bg-gradient-to-br from-purple-50/80 to-white border border-purple-100 hover:border-purple-300 shadow-2xs cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-200">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm group-hover:text-purple-600 transition-colors">
                ماتریس نقش‌ها و مجوزها (RBAC)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {roles.length} نقش تعریف‌شده با مجوزهای دانه‌بندی‌شده
              </p>
            </div>
          </div>
          <ArrowLeft className="w-5 h-5 text-purple-600 group-hover:-translate-x-1 transition-transform" />
        </div>
      </div>

      {readOnlyNotice}

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap p-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
        {SETTINGS_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── تب عمومی و سازمانی ── */}
      {activeTab === 'general' && (
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Building className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">مشخصات سازمان و فضای کاری</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                نام سازمان، شناسه فضای کاری، طول اسپرینت، منطقه زمانی و تقویم پایه سامانه
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">نام سازمان / شرکت</label>
              <input
                type="text"
                value={generalSettings.orgName}
                onChange={(e) => setGeneralSettings(prev => ({ ...prev, orgName: e.target.value }))}
                {...disabledAttr}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden font-bold disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">شناسه دامنه فضای کاری (Slug)</label>
              <div className="flex items-center" dir="ltr">
                <span className="px-3 py-2.5 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-xs text-slate-500 font-mono">
                  app.tadbir.ir/
                </span>
                <input
                  type="text"
                  value={generalSettings.workspaceSlug}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, workspaceSlug: e.target.value }))}
                  {...disabledAttr}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-r-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden font-mono disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">طول دوره اسپرینت پیش‌فرض</label>
              <select
                value={generalSettings.sprintLength}
                onChange={(e) => setGeneralSettings(prev => ({ ...prev, sprintLength: e.target.value }))}
                {...disabledAttr}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden font-medium cursor-pointer disabled:opacity-60"
              >
                {SPRINT_LENGTHS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">منطقه زمانی سازمان</label>
              <select
                value={generalSettings.timezone}
                onChange={(e) => setGeneralSettings(prev => ({ ...prev, timezone: e.target.value }))}
                {...disabledAttr}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden font-medium cursor-pointer disabled:opacity-60"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">تقویم پایه سامانه</label>
              <select
                value={generalSettings.calendar}
                onChange={(e) => setGeneralSettings(prev => ({ ...prev, calendar: e.target.value }))}
                {...disabledAttr}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden font-medium cursor-pointer disabled:opacity-60"
              >
                <option value="jalali">تقویم هجری شمسی (جلالی)</option>
                <option value="gregorian">تقویم میلادی</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── تب اعلان‌ها ── */}
      {activeTab === 'notifications' && (
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Bell className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">تنظیمات اعلانات و هشدارها</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                سیاست ارسال اعلان‌های درون‌برنامه‌ای و ایمیلی برای رویدادهای سامانه
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {([
              {
                key: 'emailAlerts' as const,
                title: 'هشدار تخصیص تسک و وظیفه جدید',
                description: 'ارسال نوتیفیکیشن درون برنامه‌ای و ایمیلی به محض ارجاع کار',
              },
              {
                key: 'deadlineReminders' as const,
                title: 'هشدار سررسید و تسک‌های دارای تأخیر',
                description: 'اعلان ۲۴ ساعت قبل از رسیدن موعد تحویل یا بروز تأخیر',
              },
              {
                key: 'mentionAlerts' as const,
                title: 'یادداشت‌ها و منشن‌ها (@mention)',
                description: 'اطلاع‌رسانی بلادرنگ هنگام منشن شدن در دیدگاه‌های پروژه‌ها',
              },
              {
                key: 'weeklyDigest' as const,
                title: 'خلاصه هفتگی فعالیت‌ها',
                description: 'ارسال گزارش هفتگی پیشرفت پروژه‌ها و وظایف به ایمیل مدیران',
              },
            ]).map(item => (
              <label
                key={item.key}
                className={`flex items-center justify-between p-3 bg-slate-50 rounded-xl ${canEdit ? 'cursor-pointer' : 'opacity-60'}`}
              >
                <div>
                  <span className="font-bold text-slate-800 block">{item.title}</span>
                  <span className="text-slate-500">{item.description}</span>
                </div>
                <input
                  type="checkbox"
                  checked={notificationSettings[item.key]}
                  onChange={(e) => setNotificationSettings(prev => ({ ...prev, [item.key]: e.target.checked }))}
                  disabled={!canEdit}
                  className="w-4 h-4 text-indigo-600 rounded-sm"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── تب امنیت ── */}
      {activeTab === 'security' && (
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Lock className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">سیاست‌های امنیتی و احراز هویت</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                الزامات ورود، حداقل طول رمز عبور، مدت نشست و محدودیت تلاش ناموفق
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <label className={`flex items-center justify-between p-3 bg-slate-50 rounded-xl ${canEdit ? 'cursor-pointer' : 'opacity-60'}`}>
              <div>
                <span className="font-bold text-slate-800 block">الزام احراز هویت دو مرحله‌ای (2FA) برای تمامی پرسنل</span>
                <span className="text-slate-500">کاربران بدون تأیید پیامکی یا TOTP اجازه ورود به سامانه‌های حساس را نخواهند داشت.</span>
              </div>
              <input
                type="checkbox"
                checked={securitySettings.twoFactorEnforced}
                onChange={(e) => setSecuritySettings(prev => ({ ...prev, twoFactorEnforced: e.target.checked }))}
                disabled={!canEdit}
                className="w-4 h-4 text-indigo-600 rounded-sm"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">حداقل طول رمز عبور</label>
                <input
                  type="number"
                  min={6}
                  max={64}
                  value={securitySettings.passwordMinLength}
                  onChange={(e) => setSecuritySettings(prev => ({ ...prev, passwordMinLength: Math.max(6, Number(e.target.value) || 8) }))}
                  {...disabledAttr}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden font-bold disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">مدت اعتبار نشست (دقیقه)</label>
                <input
                  type="number"
                  min={15}
                  max={10080}
                  value={securitySettings.sessionLifetimeMinutes}
                  onChange={(e) => setSecuritySettings(prev => ({ ...prev, sessionLifetimeMinutes: Math.max(15, Number(e.target.value) || 480) }))}
                  {...disabledAttr}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden font-bold disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">حداکثر تلاش ناموفق ورود</label>
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={securitySettings.maxLoginAttempts}
                  onChange={(e) => setSecuritySettings(prev => ({ ...prev, maxLoginAttempts: Math.max(3, Number(e.target.value) || 5) }))}
                  {...disabledAttr}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden font-bold disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── تب اولویت‌های وظایف ── */}
      {activeTab === 'priorities' && (
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ListFilter className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">اولویت‌های وظایف و برچسب‌های آن‌ها</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  عنوان نمایشی و رنگ هر اولویت در بردهای کانبان، لیست‌ها و نمودارها
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTaskPriorities(prev => [...prev].sort((a, b) => a.order - b.order))}
              className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مرتب‌سازی بر اساس ترتیب پیش‌فرض</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {taskPriorities.map((priority, index) => (
              <div key={priority.id} className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <input
                  type="color"
                  value={priority.color}
                  onChange={(e) => setTaskPriorities(prev => prev.map(p => p.id === priority.id ? { ...p, color: e.target.value } : p))}
                  disabled={!canEdit}
                  className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer bg-white p-0.5 disabled:opacity-60"
                  title="رنگ اولویت"
                />
                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-200/70 px-2 py-1 rounded-lg" dir="ltr">
                  {priority.id}
                </span>
                <input
                  type="text"
                  value={priority.label}
                  onChange={(e) => setTaskPriorities(prev => prev.map(p => p.id === priority.id ? { ...p, label: e.target.value } : p))}
                  {...disabledAttr}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-hidden disabled:opacity-60"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTaskPriorities(prev => {
                      if (index === 0) return prev;
                      const next = [...prev];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next.map((p, i) => ({ ...p, order: i + 1 }));
                    })}
                    disabled={!canEdit || index === 0}
                    className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                    title="انتقال به بالا"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskPriorities(prev => {
                      if (index === prev.length - 1) return prev;
                      const next = [...prev];
                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                      return next.map((p, i) => ({ ...p, order: i + 1 }));
                    })}
                    disabled={!canEdit || index === taskPriorities.length - 1}
                    className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                    title="انتقال به پایین"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── تب محتوا و فرایند ── */}
      {activeTab === 'content' && (
        <>
          {/* Content Types Management Section */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Tags className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">مدیریت انواع محتوا</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    انواع محتوا برای فیلتر و ثبت در بخش رسانه
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleAddContentType} className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <FolderPlus className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={newContentTypeInput}
                  onChange={(e) => setNewContentTypeInput(e.target.value)}
                  disabled={!canEdit}
                  placeholder="افزودن نوع جدید (مثال: موشن‌گرافیک، گزارش خبری)..."
                  className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={!newContentTypeInput.trim() || !canEdit}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن نوع محتوا</span>
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
              {contentTypes.map((ct) => (
                <div
                  key={ct.id}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 group hover:border-indigo-200 hover:bg-indigo-50/20 transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 truncate" title={ct.name}>
                      {ct.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`آیا از حذف نوع محتوای "${ct.name}" اطمینان دارید؟`)) {
                          deleteContentType(ct.id);
                        }
                      }}
                      disabled={!canEdit}
                      className="p-1.5 bg-slate-200 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Process Templates Management Section */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">مدیریت الگوهای فرایند تولید محتوا</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تعریف مراحل تولید، افراد درگیر و چرخه کاری برای انواع مختلف تولیدات رسانه‌ای
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingProcessTemplate(null);
                  setIsProcessModalOpen(true);
                }}
                disabled={!canEdit}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                افزودن الگو فرایند جدید
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {processTemplates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-200 hover:shadow-md hover:bg-indigo-50/10 transition-all flex flex-col gap-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-extrabold text-slate-800 truncate" title={template.name}>
                        {template.name}
                      </h4>
                      <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded mt-1 inline-block" dir="ltr">
                        {template.type}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProcessTemplate(template);
                          setIsProcessModalOpen(true);
                        }}
                        disabled={!canEdit}
                        className="p-1.5 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                        title="ویرایش الگو"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`آیا از حذف الگوی فرایند "${template.name}" اطمینان دارید؟`)) {
                            deleteProcessTemplate(template.id);
                          }
                        }}
                        disabled={!canEdit}
                        className="p-1.5 bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                        title="حذف الگو"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {template.description}
                  </div>
                  <div className="flex items-center gap-4 mt-auto pt-2 border-t border-slate-100/50">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>{template.stages.length} مرحله مجزا</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Publishing Platforms Management Section */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">مدیریت کانال‌ها و پلتفرم‌های انتشار محتوا</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تعریف و ویرایش شبکه‌های اجتماعی، پیام‌رسان‌ها و رسانه‌های رسمی جهت زمان‌بندی و انتشار محتوا
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleAddPlatform} className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={newPlatformName}
                  onChange={(e) => setNewPlatformName(e.target.value)}
                  disabled={!canEdit}
                  placeholder="نام پلتفرم..."
                  className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <select
                  value={newPlatformCategory}
                  onChange={(e) => setNewPlatformCategory(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden transition-all cursor-pointer disabled:opacity-60"
                >
                  <option value="messaging">پیام‌رسان</option>
                  <option value="social">شبکه اجتماعی</option>
                  <option value="video">ویدیو و صوت</option>
                  <option value="website">وب‌سایت رسمی</option>
                </select>
              </div>

              <div>
                <select
                  value={newPlatformIcon}
                  onChange={(e) => setNewPlatformIcon(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden transition-all cursor-pointer font-mono disabled:opacity-60"
                  dir="ltr"
                >
                  <option value="globe">Globe (وب‌سایت)</option>
                  <option value="send">Send (تلگرام/ایتا)</option>
                  <option value="message-circle">Message (بله/واتس‌اپ)</option>
                  <option value="instagram">Instagram</option>
                  <option value="twitter">Twitter</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="youtube">YouTube</option>
                  <option value="video">Video (آپارات)</option>
                  <option value="mic">Mic (پادکست)</option>
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPlatformHandle}
                  onChange={(e) => setNewPlatformHandle(e.target.value)}
                  disabled={!canEdit}
                  placeholder="شناسه/آدرس"
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all font-mono disabled:opacity-60"
                  dir="ltr"
                />
                <button
                  type="submit"
                  disabled={!newPlatformName.trim() || !canEdit}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن</span>
                </button>
              </div>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
              {publishingPlatforms.map((plat) => (
                <div
                  key={plat.id}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-2 group transition-all ${
                    plat.isEnabled ? 'bg-slate-50 border-slate-200 hover:border-indigo-200' : 'bg-slate-100/60 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      onClick={() => canEdit && handleTogglePlatform(plat.id)}
                      className={`w-3 h-3 rounded-full shrink-0 transition-colors ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'} ${
                        plat.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      title={plat.isEnabled ? 'فعال (کلیک جهت غیرفعال‌سازی)' : 'غیرفعال (کلیک جهت فعال‌سازی)'}
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 block truncate" title={plat.name}>
                        {plat.name}
                      </span>
                      {plat.defaultHandle && (
                        <span className="text-[10px] text-slate-400 font-mono block truncate" dir="ltr">
                          {plat.defaultHandle}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => canEdit && handleTogglePlatform(plat.id)}
                      disabled={!canEdit}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-40 ${
                        plat.isEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-600'
                      } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      {plat.isEnabled ? 'فعال' : 'غیرفعال'}
                    </button>
                    <button
                      type="button"
                      onClick={() => canEdit && handleDeletePlatform(plat.id, plat.name)}
                      disabled={!canEdit}
                      className="p-1.5 bg-slate-200 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                      title="حذف پلتفرم"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Management Section */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Tags className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">مدیریت دسته‌بندی‌های سامانه و پروژه‌ها</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    دسته‌بندی‌های قابل انتخاب در تعریف پروژه‌ها، تسک‌ها، الگوها و اتاق فکر
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (confirm('آیا مایلید لیست دسته‌بندی‌ها به عناوین پیش‌فرض رسانه‌ای تدبیر بازگردانی شود؟')) {
                    resetCategories();
                  }
                }}
                disabled={!canEdit}
                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بازگردانی دسته‌بندی‌های پیش‌فرض</span>
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <FolderPlus className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  disabled={!canEdit}
                  placeholder="افزودن دسته‌بندی جدید (مثال: مستندسازی و آرشیو، پادکست و صدا، پویش تبلیغاتی)..."
                  className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={!newCatInput.trim() || !canEdit}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن دسته‌بندی</span>
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
              {categories.map((cat, idx) => {
                const isEditing = editingCatIndex === idx;

                return (
                  <div
                    key={cat + idx}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 group hover:border-indigo-200 hover:bg-indigo-50/20 transition-all"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          autoFocus
                          value={editingCatValue}
                          onChange={(e) => setEditingCatValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditCategory(cat);
                            if (e.key === 'Escape') setEditingCatIndex(null);
                          }}
                          className="w-full px-2 py-1 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => saveEditCategory(cat)}
                          className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                          title="ذخیره تغییرات"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatIndex(null)}
                          className="p-1 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 cursor-pointer"
                          title="انصراف"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-800 truncate" title={cat}>
                            {cat}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditCategory(idx, cat)}
                            disabled={!canEdit}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                            title="ویرایش دسته‌بندی"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (categories.length <= 1) {
                                alert('حداقل یک دسته‌بندی باید در سامانه فعال باشد.');
                                return;
                              }
                              if (confirm(`آیا از حذف دسته‌بندی «${cat}» اطمینان دارید؟`)) {
                                deleteCategory(cat);
                              }
                            }}
                            disabled={!canEdit}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                            title="حذف دسته‌بندی"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <SaveStateBadge />
        <button
          type="button"
          onClick={handleManualSave}
          disabled={isSavingNow || !canEdit}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
        >
          {isSavingNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSavingNow ? 'در حال ذخیره...' : 'ذخیره تغییرات روی سرور'}</span>
        </button>
      </div>

      <ProcessTemplateModal
        isOpen={isProcessModalOpen}
        onClose={() => {
          setIsProcessModalOpen(false);
          setEditingProcessTemplate(null);
        }}
        template={editingProcessTemplate}
        onSave={(data) => {
          if ('id' in data && data.id) {
            updateProcessTemplate(data.id, data);
          } else {
            addProcessTemplate(data);
          }
        }}
      />
    </div>
  );
};
