import { BaleSettingsPanel } from '../bale/BaleSettingsPanel';
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProcessTemplateModal } from './ProcessTemplateModal';
import { PlatformModal, platformIcon } from './PlatformModal';
import { ContentProcessTemplate, PublishingPlatform } from '../../types';
import { request } from '../../api/client';
import { ActivityView } from '../activity/ActivityView';
import { DamActivityHistory } from '../dam/DamActivityHistory';
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
  Server,
  Palette,
  FolderCog,
  Pencil,
  Activity,
  Bot,
  Lightbulb
} from 'lucide-react';

interface DamCategoryRecord {
  id: number;
  name: string;
  description?: string | null;
}

type SettingsTab = 'general' | 'notifications' | 'bale' | 'security' | 'priorities' | 'dam' | 'ideas' | 'content' | 'activity';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'عمومی و سازمانی', icon: <Building className="w-4 h-4" /> },
  { id: 'notifications', label: 'اعلان‌ها و هشدارها', icon: <Bell className="w-4 h-4" /> },
  { id: 'bale', label: 'ربات بله', icon: <Bot className="w-4 h-4" /> },
  { id: 'security', label: 'امنیت و احراز هویت', icon: <Lock className="w-4 h-4" /> },
  { id: 'priorities', label: 'اولویت‌ها و وضعیت وظایف', icon: <ListFilter className="w-4 h-4" /> },
  { id: 'dam', label: 'دارایی‌های دیجیتال', icon: <FolderCog className="w-4 h-4" /> },
  { id: 'ideas', label: 'دسته‌بندی ایده‌ها', icon: <Lightbulb className="w-4 h-4" /> },
  { id: 'content', label: 'محتوا و فرایند', icon: <Layers className="w-4 h-4" /> },
  { id: 'activity', label: 'فید فعالیت‌ها', icon: <Activity className="w-4 h-4" /> },
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
    ideaCategories,
    setIdeaCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    contentTypes,
    targetAudiences,
    setTargetAudiences,
    addContentType,
    deleteContentType,
    updateContentType,
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
    taskStatuses,
    setTaskStatuses,
    damStatuses,
    setDamStatuses,
    contentStatuses,
    setContentStatuses,
    settingsSaveState,
    settingsSaveError,
    saveSettingsNow,
    notify,
  } = useApp();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // فقط مدیر سیستم یا دارندگان مجوزهای مدیریت پیکربندی می‌توانند تغییر دهند.
  const canManageSystemSettings = currentUser.role === 'admin' || hasPermission('settings.manage');
  const canEdit = canManageSystemSettings
    || hasPermission('content.edit');

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

  // Platform Management State (modal-based)
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<PublishingPlatform | null>(null);

  // Category Management State
  const [newCatInput, setNewCatInput] = useState('');
  const [newIdeaCategory, setNewIdeaCategory] = useState('');
  const [editingIdeaCategoryIndex, setEditingIdeaCategoryIndex] = useState<number | null>(null);
  const [editingIdeaCategoryValue, setEditingIdeaCategoryValue] = useState('');
  const [editingCatIndex, setEditingCatIndex] = useState<number | null>(null);
  const [editingCatValue, setEditingCatValue] = useState('');

  // Content Types & target audiences state
  const [newContentTypeInput, setNewContentTypeInput] = useState('');
  const [newTargetAudienceInput, setNewTargetAudienceInput] = useState('');

  // DAM Categories State (server-side taxonomy)
  const [damCategories, setDamCategories] = useState<DamCategoryRecord[]>([]);
  const [damCategoriesLoading, setDamCategoriesLoading] = useState(false);
  const [damCategoryError, setDamCategoryError] = useState('');
  const [newDamCategoryName, setNewDamCategoryName] = useState('');
  const [editingDamCategoryId, setEditingDamCategoryId] = useState<number | null>(null);
  const [editingDamCategoryName, setEditingDamCategoryName] = useState('');

  useEffect(() => {
    if (activeTab !== 'dam') return;
    let cancelled = false;
    setDamCategoriesLoading(true);
    setDamCategoryError('');
    request<{ data: DamCategoryRecord[] }>('/dam/library/categories')
      .then(result => { if (!cancelled) setDamCategories(result.data || []); })
      .catch(error => { if (!cancelled) setDamCategoryError(error instanceof Error ? error.message : 'دریافت دسته‌بندی‌ها ناموفق بود.'); })
      .finally(() => { if (!cancelled) setDamCategoriesLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleAddDamCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDamCategoryName.trim();
    if (!name) return;
    try {
      const result = await request<{ data: DamCategoryRecord }>('/dam/library/categories', { method: 'POST', body: { name } });
      setDamCategories(prev => [...prev, result.data]);
      setNewDamCategoryName('');
      notify({ type: 'success', title: 'دسته‌بندی ساخته شد', message: `«${name}» به دسته‌بندی‌های دارایی دیجیتال اضافه شد.` });
    } catch (error) {
      notify({ type: 'error', title: 'ساخت دسته‌بندی ناموفق بود', message: error instanceof Error ? error.message : undefined });
    }
  };

  const handleUpdateDamCategory = async (id: number) => {
    const name = editingDamCategoryName.trim();
    if (!name) return;
    try {
      const result = await request<{ data: DamCategoryRecord }>(`/dam/library/categories/${id}`, { method: 'PATCH', body: { name } });
      setDamCategories(prev => prev.map(c => c.id === id ? result.data : c));
      setEditingDamCategoryId(null);
      setEditingDamCategoryName('');
    } catch (error) {
      notify({ type: 'error', title: 'ویرایش دسته‌بندی ناموفق بود', message: error instanceof Error ? error.message : undefined });
    }
  };

  const handleDeleteDamCategory = async (id: number, name: string) => {
    if (!confirm(`آیا از حذف دسته‌بندی «${name}» اطمینان دارید؟ دارایی‌های آن بدون دسته می‌شوند.`)) return;
    try {
      await request(`/dam/library/categories/${id}`, { method: 'DELETE' });
      setDamCategories(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      notify({ type: 'error', title: 'حذف دسته‌بندی ناموفق بود', message: error instanceof Error ? error.message : undefined });
    }
  };

  const handleAddContentType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContentTypeInput.trim()) return;
    addContentType(newContentTypeInput.trim());
    setNewContentTypeInput('');
  };

  const handleAddTargetAudience = (e: React.FormEvent) => {
    e.preventDefault();
    const value = newTargetAudienceInput.trim();
    if (!value || targetAudiences.includes(value)) return;
    setTargetAudiences(previous => [...previous, value]);
    setNewTargetAudienceInput('');
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

  const handleAddIdeaCategory = (event: React.FormEvent) => {
    event.preventDefault();
    const value = newIdeaCategory.trim();
    if (!value || ideaCategories.includes(value)) return;
    setIdeaCategories(previous => [...previous, value]);
    setNewIdeaCategory('');
  };

  const saveIdeaCategory = (index: number) => {
    const value = editingIdeaCategoryValue.trim();
    if (value && !ideaCategories.some((item, itemIndex) => itemIndex !== index && item === value)) {
      setIdeaCategories(previous => previous.map((item, itemIndex) => itemIndex === index ? value : item));
    }
    setEditingIdeaCategoryIndex(null);
    setEditingIdeaCategoryValue('');
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

            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">توضیح اختیاری صفحهٔ ورود</label>
              <textarea
                value={generalSettings.loginDescription || ''}
                onChange={(e) => setGeneralSettings(prev => ({ ...prev, loginDescription: e.target.value }))}
                {...disabledAttr}
                rows={2}
                maxLength={240}
                placeholder="در حالت خالی، زیر عنوان صفحهٔ ورود توضیحی نمایش داده نمی‌شود."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs leading-6 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden resize-y disabled:opacity-60"
              />
              <p className="mt-1 text-[10px] text-slate-500">این متن عمومی است و پیش از ورود نمایش داده می‌شود؛ اطلاعات محرمانه در آن ننویسید.</p>
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

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-600" />
                  رنگ اصلی سامانه
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={generalSettings.themeColor || '#4f46e5'}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, themeColor: e.target.value }))}
                  disabled={!canEdit}
                  className="w-12 h-11 rounded-xl border border-slate-200 cursor-pointer bg-white p-1 shrink-0 disabled:opacity-60"
                  title="انتخاب رنگ اصلی سامانه"
                />
                <input
                  type="text"
                  value={generalSettings.themeColor || '#4f46e5'}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, themeColor: e.target.value }))}
                  {...disabledAttr}
                  dir="ltr"
                  maxLength={7}
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden font-mono disabled:opacity-60 text-left"
                />
                <span
                  className="px-3 py-2.5 rounded-xl text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: generalSettings.themeColor || '#4f46e5' }}
                >
                  پیش‌نمایش
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                این رنگ در دکمه‌ها، سربرگ‌ها و اجزای اصلی سامانه اعمال می‌شود.
              </p>
            </div>
            <label className="sm:col-span-2 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span><strong className="block text-xs text-slate-800">ماژول دبیرخانه و کارتابل نامه‌ها</strong><span className="mt-1 block text-[11px] text-slate-500">نمایش دبیرخانه در منو و نامه‌های ارجاع‌شده در کارتابل کاربران</span></span>
              <input type="checkbox" checked={generalSettings.secretariatEnabled !== false} disabled={!canEdit} onChange={event => setGeneralSettings(previous => ({ ...previous, secretariatEnabled: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
            </label>
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
                سیاست ارسال اعلان‌های درون‌برنامه‌ای برای رویدادهای سامانه
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {([
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

      {/* ── تب مستقل ربات بله در بخش تنظیمات اعلان ── */}
      {activeTab === 'bale' && (
        hasPermission('settings.manage')
          ? <BaleSettingsPanel />
          : <div className="p-6 bg-white rounded-3xl border border-slate-200 text-sm text-slate-600">برای مدیریت ربات بله به مجوز مدیریت تنظیمات نیاز دارید.</div>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">حداقل طول رمز عبور</label>
                <input
                  type="number"
                  min={8}
                  value={8}
                  readOnly
                  aria-label="حداقل طول رمز عبور: ۸ نویسه"
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

      {/* ── وضعیت‌های وظایف ── */}
      {activeTab === 'priorities' && (
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">وضعیت‌های وظایف</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  عنوان نمایشی و رنگ هر وضعیت در لیست‌ها، برد کانبان و جزئیات تسک
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {[...taskStatuses].sort((a, b) => a.order - b.order).map((status, index, arr) => (
              <div key={status.id} className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <input
                  type="color"
                  value={status.color}
                  onChange={(e) => setTaskStatuses(prev => prev.map(s => s.id === status.id ? { ...s, color: e.target.value } : s))}
                  disabled={!canEdit}
                  className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer bg-white p-0.5 disabled:opacity-60"
                  title="رنگ وضعیت"
                />
                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-200/70 px-2 py-1 rounded-lg" dir="ltr">
                  {status.id}
                </span>
                <input
                  type="text"
                  value={status.label}
                  onChange={(e) => setTaskStatuses(prev => prev.map(s => s.id === status.id ? { ...s, label: e.target.value } : s))}
                  {...disabledAttr}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-hidden disabled:opacity-60"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTaskStatuses(prev => {
                      const sorted = [...prev].sort((a, b) => a.order - b.order);
                      if (index === 0) return prev;
                      [sorted[index - 1], sorted[index]] = [sorted[index], sorted[index - 1]];
                      return sorted.map((s, i) => ({ ...s, order: i + 1 }));
                    })}
                    disabled={!canEdit || index === 0}
                    className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                    title="انتقال به بالا"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskStatuses(prev => {
                      const sorted = [...prev].sort((a, b) => a.order - b.order);
                      if (index === sorted.length - 1) return prev;
                      [sorted[index + 1], sorted[index]] = [sorted[index], sorted[index + 1]];
                      return sorted.map((s, i) => ({ ...s, order: i + 1 }));
                    })}
                    disabled={!canEdit || index === arr.length - 1}
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

      {/* ── تب دارایی‌های دیجیتال ── */}
      {activeTab === 'dam' && (
        <>
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Tags className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">دسته‌بندی‌های دارایی‌های دیجیتال</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  دسته‌بندی‌های مخزن مرکزی؛ مستقیماً روی سرور ذخیره می‌شوند
                </p>
              </div>
            </div>

            <form onSubmit={handleAddDamCategory} className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <FolderPlus className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={newDamCategoryName}
                  onChange={(e) => setNewDamCategoryName(e.target.value)}
                  disabled={!canEdit}
                  placeholder="افزودن دسته‌بندی جدید مخزن..."
                  className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={!newDamCategoryName.trim() || !canEdit}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن</span>
              </button>
            </form>

            {damCategoriesLoading && (
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                در حال دریافت دسته‌بندی‌ها...
              </p>
            )}
            {damCategoryError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{damCategoryError}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {damCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 group hover:border-indigo-200 transition-all"
                >
                  {editingDamCategoryId === cat.id ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <input
                        type="text"
                        autoFocus
                        value={editingDamCategoryName}
                        onChange={(e) => setEditingDamCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleUpdateDamCategory(cat.id);
                          if (e.key === 'Escape') setEditingDamCategoryId(null);
                        }}
                        className="w-full px-2 py-1 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden"
                      />
                      <button type="button" onClick={() => void handleUpdateDamCategory(cat.id)} className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer" title="ذخیره">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingDamCategoryId(null)} className="p-1 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 cursor-pointer" title="انصراف">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <span className="text-xs font-bold text-slate-800 truncate" title={cat.name}>{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setEditingDamCategoryId(cat.id); setEditingDamCategoryName(cat.name); }}
                          disabled={!canEdit}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                          title="ویرایش"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDamCategory(cat.id, cat.name)}
                          disabled={!canEdit}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {!damCategoriesLoading && damCategories.length === 0 && !damCategoryError && (
              <p className="text-xs text-slate-400 text-center py-4">هنوز دسته‌بندی‌ای برای مخزن ثبت نشده است.</p>
            )}
          </div>

          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <CheckCircle2 className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">وضعیت‌های دارایی‌های دیجیتال</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  عنوان نمایشی و رنگ هر وضعیت در مخزن مرکزی دارایی‌ها
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {[...damStatuses].sort((a, b) => a.order - b.order).map((status, index, arr) => (
                <div key={status.id} className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <input
                    type="color"
                    value={status.color}
                    onChange={(e) => setDamStatuses(prev => prev.map(s => s.id === status.id ? { ...s, color: e.target.value } : s))}
                    disabled={!canEdit}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer bg-white p-0.5 disabled:opacity-60"
                    title="رنگ وضعیت"
                  />
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-200/70 px-2 py-1 rounded-lg" dir="ltr">
                    {status.id}
                  </span>
                  <input
                    type="text"
                    value={status.label}
                    onChange={(e) => setDamStatuses(prev => prev.map(s => s.id === status.id ? { ...s, label: e.target.value } : s))}
                    {...disabledAttr}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-hidden disabled:opacity-60"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDamStatuses(prev => {
                        const sorted = [...prev].sort((a, b) => a.order - b.order);
                        if (index === 0) return prev;
                        [sorted[index - 1], sorted[index]] = [sorted[index], sorted[index - 1]];
                        return sorted.map((s, i) => ({ ...s, order: i + 1 }));
                      })}
                      disabled={!canEdit || index === 0}
                      className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                      title="انتقال به بالا"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDamStatuses(prev => {
                        const sorted = [...prev].sort((a, b) => a.order - b.order);
                        if (index === sorted.length - 1) return prev;
                        [sorted[index + 1], sorted[index]] = [sorted[index], sorted[index + 1]];
                        return sorted.map((s, i) => ({ ...s, order: i + 1 }));
                      })}
                      disabled={!canEdit || index === arr.length - 1}
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

          <DamActivityHistory />
        </>
      )}

      {/* ── تب دسته‌بندی ایده‌ها ── */}
      {activeTab === 'ideas' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Lightbulb className="h-5 w-5" /></span>
            <div><h3 className="text-sm font-black text-slate-900">دسته‌بندی‌های ایده</h3><p className="mt-1 text-[11px] text-slate-500">دسته‌هایی که هنگام ثبت ایده و در فیلتر صفحه اتاق فکر قابل انتخاب هستند.</p></div>
          </div>
          <form onSubmit={handleAddIdeaCategory} className="flex flex-col gap-2 sm:flex-row">
            <input disabled={!canManageSystemSettings} value={newIdeaCategory} onChange={event => setNewIdeaCategory(event.target.value)} maxLength={80} className="ui-input flex-1 text-xs disabled:opacity-60" placeholder="نام دسته‌بندی جدید؛ مثال: بهبود فرایند" />
            <button disabled={!canManageSystemSettings || !newIdeaCategory.trim()} type="submit" className="ui-button ui-button-primary text-xs disabled:opacity-50"><Plus className="h-4 w-4" />افزودن دسته</button>
          </form>
          <div className="space-y-2">
            {ideaCategories.map((category, index) => <div key={`${category}-${index}`} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {editingIdeaCategoryIndex === index ? <>
                <input autoFocus value={editingIdeaCategoryValue} onChange={event => setEditingIdeaCategoryValue(event.target.value)} maxLength={80} className="ui-input flex-1 bg-white text-xs" />
                <button type="button" onClick={() => saveIdeaCategory(index)} className="ui-button ui-button-ghost ui-icon-button text-emerald-600" aria-label="ذخیره"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setEditingIdeaCategoryIndex(null); setEditingIdeaCategoryValue(''); }} className="ui-button ui-button-ghost ui-icon-button" aria-label="انصراف"><X className="h-4 w-4" /></button>
              </> : <>
                <span className="flex-1 text-xs font-bold text-slate-800">{category}</span>
                {canManageSystemSettings && <button type="button" onClick={() => { setEditingIdeaCategoryIndex(index); setEditingIdeaCategoryValue(category); }} className="ui-button ui-button-ghost ui-icon-button text-indigo-600" aria-label={`ویرایش ${category}`}><Pencil className="h-4 w-4" /></button>}
                {canManageSystemSettings && <button type="button" onClick={() => setIdeaCategories(previous => previous.filter((_, itemIndex) => itemIndex !== index))} className="ui-button ui-button-ghost ui-icon-button text-rose-600" aria-label={`حذف ${category}`}><Trash2 className="h-4 w-4" /></button>}
              </>}
            </div>)}
            {!ideaCategories.length && <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">هنوز دسته‌بندی ایده‌ای تعریف نشده است.</p>}
          </div>
        </div>
      )}

      {/* ── تب محتوا و فرایند ── */}
      {activeTab === 'content' && (
        <>
          {/* Content Statuses Section */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ListFilter className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">وضعیت‌های محتوا و ستون‌های برد کانبان</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    عنوان نمایشی، رنگ و ترتیب هر وضعیت در جدول، کانبان، تقویم و بج‌ها
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {contentStatuses.map((status, index) => (
                <div key={status.id} className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <input
                    type="color"
                    value={status.color}
                    onChange={(e) => setContentStatuses(prev => prev.map(st => st.id === status.id ? { ...st, color: e.target.value } : st))}
                    disabled={!canEdit}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer bg-white p-0.5 disabled:opacity-60 shrink-0"
                    title="رنگ وضعیت"
                  />
                  <input
                    type="text"
                    value={status.label}
                    onChange={(e) => setContentStatuses(prev => prev.map(st => st.id === status.id ? { ...st, label: e.target.value } : st))}
                    {...disabledAttr}
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-hidden disabled:opacity-60"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setContentStatuses(prev => {
                        if (index === 0) return prev;
                        const next = [...prev];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next.map((st, i) => ({ ...st, order: i + 1 }));
                      })}
                      disabled={!canEdit || index === 0}
                      className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                      title="انتقال به بالا"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentStatuses(prev => {
                        if (index === prev.length - 1) return prev;
                        const next = [...prev];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        return next.map((st, i) => ({ ...st, order: i + 1 }));
                      })}
                      disabled={!canEdit || index === contentStatuses.length - 1}
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

          {/* Target Audiences Management Section */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Users className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">مخاطبان هدف محتوا</h3>
                <p className="text-xs text-slate-500 mt-0.5">گزینه‌های این فهرست هنگام ایجاد و ویرایش محتوا قابل انتخاب و در صفحهٔ محتوا قابل فیلتر هستند.</p>
              </div>
            </div>

            <form onSubmit={handleAddTargetAudience} className="flex items-center gap-2.5">
              <input
                type="text"
                value={newTargetAudienceInput}
                onChange={(event) => setNewTargetAudienceInput(event.target.value)}
                disabled={!canEdit}
                maxLength={80}
                placeholder="مثال: مشتریان سازمانی"
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden disabled:opacity-60"
              />
              <button type="submit" disabled={!newTargetAudienceInput.trim() || !canEdit} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                <Plus className="w-4 h-4" />افزودن مخاطب
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {targetAudiences.map((audience, index) => (
                <div key={`${audience}-${index}`} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                  <input
                    type="text"
                    defaultValue={audience}
                    disabled={!canEdit}
                    maxLength={80}
                    aria-label={`ویرایش مخاطب هدف ${audience}`}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (!value || targetAudiences.some((item, itemIndex) => itemIndex !== index && item === value)) {
                        event.target.value = audience;
                        return;
                      }
                      if (value !== audience) setTargetAudiences(previous => previous.map((item, itemIndex) => itemIndex === index ? value : item));
                    }}
                    className="min-w-0 flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 disabled:opacity-60"
                  />
                  <button type="button" disabled={!canEdit} onClick={() => setTargetAudiences(previous => previous.filter((_, itemIndex) => itemIndex !== index))} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-40" aria-label={`حذف مخاطب هدف ${audience}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {targetAudiences.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">هنوز مخاطب هدفی تعریف نشده است.</p>}
          </div>

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
                    <input type="color" aria-label={`رنگ ${ct.name}`} disabled={!canEdit} value={ct.color || '#6366f1'} onChange={e => updateContentType(ct.id, e.target.value)} className="w-7 h-7 shrink-0 rounded border border-slate-200 cursor-pointer"/>
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
              <button
                type="button"
                onClick={() => {
                  setEditingPlatform(null);
                  setIsPlatformModalOpen(true);
                }}
                disabled={!canEdit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                افزودن پلتفرم جدید
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
              {publishingPlatforms.map((plat) => {
                const Icon = platformIcon(plat.iconName);
                const address = plat.urlPattern || plat.defaultHandle || plat.handle;
                return (
                  <div
                    key={plat.id}
                    className={`p-3 rounded-2xl border flex items-start justify-between gap-2 group transition-all ${
                      plat.isEnabled ? 'bg-slate-50 border-slate-200 hover:border-indigo-200' : 'bg-slate-100/60 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs"
                        style={{ backgroundColor: plat.color || '#6366f1' }}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 block truncate" title={plat.name}>
                          {plat.name}
                        </span>
                        {plat.description && (
                          <span className="text-[11px] text-slate-500 block truncate" title={plat.description}>
                            {plat.description}
                          </span>
                        )}
                        {address && (
                          <span className="text-[10px] text-slate-400 font-mono block truncate" dir="ltr">
                            {address}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => canEdit && handleTogglePlatform(plat.id)}
                          disabled={!canEdit}
                          className={`mt-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-40 ${
                            plat.isEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-600'
                          } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                        >
                          {plat.isEnabled ? 'فعال' : 'غیرفعال'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!canEdit) return;
                          setEditingPlatform(plat);
                          setIsPlatformModalOpen(true);
                        }}
                        disabled={!canEdit}
                        className="p-1.5 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                        title="ویرایش پلتفرم"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => canEdit && handleDeletePlatform(plat.id, plat.name)}
                        disabled={!canEdit}
                        className="p-1.5 bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                        title="حذف پلتفرم"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {publishingPlatforms.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">هنوز پلتفرمی ثبت نشده است؛ از دکمه «افزودن پلتفرم جدید» استفاده کنید.</p>
            )}
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

      {/* ── فید فعالیت‌ها ── */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <ActivityView embedded />
        </div>
      )}

      {/* Action Buttons */}
      {!['activity', 'bale'].includes(activeTab) && (
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
      )}

      <PlatformModal
        isOpen={isPlatformModalOpen}
        platform={editingPlatform}
        onClose={() => {
          setIsPlatformModalOpen(false);
          setEditingPlatform(null);
        }}
        onSave={(data) => {
          if (data.id) {
            updatePublishingPlatforms(publishingPlatforms.map(p => p.id === data.id ? { ...p, ...data, id: data.id } : p));
          } else {
            updatePublishingPlatforms([...publishingPlatforms, { ...data, id: `plat-${Date.now()}` } as PublishingPlatform]);
          }
        }}
      />

      <ProcessTemplateModal
        isOpen={isProcessModalOpen}
        onClose={() => {
          setIsProcessModalOpen(false);
          setEditingProcessTemplate(null);
        }}
        template={editingProcessTemplate}
        onSave={async (data) => {
          if ('id' in data && data.id) {
            updateProcessTemplate(data.id, data);
          } else {
            await addProcessTemplate(data);
          }
        }}
      />
    </div>
  );
};
