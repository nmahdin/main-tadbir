import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProcessTemplateModal } from './ProcessTemplateModal';
import { ContentProcessTemplate } from '../../types';
import {
  Settings,
  Building,
  Shield,
  Bell,
  Workflow,
  Save,
  RotateCcw,
  CheckCircle2,
  Lock,
  UserCheck,
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
  Layers
} from 'lucide-react';

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
    resetCategories 
  } = useApp();

  // Process Templates State
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [editingProcessTemplate, setEditingProcessTemplate] = useState<ContentProcessTemplate | null>(null);

  const [orgName, setOrgName] = useState('سامانه سازمانی تدبیر');
  const [workspaceSlug, setWorkspaceSlug] = useState('tadbir-corp');
  const [defaultSprintLength, setDefaultSprintLength] = useState('2 weeks');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [mentionAlerts, setMentionAlerts] = useState(true);
  const [twoFactorEnforced, setTwoFactorEnforced] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 text-right" dir="rtl">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-indigo-600" />
          <span>تنظیمات عمومی سامانه تدبیر</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          پیکربندی هویت سازمان، دسته‌بندی‌های پروژه‌ها، امنیت و اعلانات درون‌برنامه‌ای
        </p>
      </div>

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

      {saveSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>تنظیمات با موفقیت ذخیره و در سامانه تدبیر اعمال شد.</span>
        </div>
      )}

      {/* Content Types Management Section */}
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-5 mt-6">
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
              placeholder="افزودن نوع جدید (مثال: موشن‌گرافیک، گزارش خبری)..."
              className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!newContentTypeInput.trim()}
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
                  className="p-1.5 bg-slate-200 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
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
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
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
                    className="p-1.5 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 rounded-lg transition-colors cursor-pointer"
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
                    className="p-1.5 bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
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

        {/* Add new platform form */}
        <form onSubmit={handleAddPlatform} className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div className="relative">
            <Globe className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={newPlatformName}
              onChange={(e) => setNewPlatformName(e.target.value)}
              placeholder="نام پلتفرم..."
              className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
            />
          </div>

          <div>
            <select
              value={newPlatformCategory}
              onChange={(e) => setNewPlatformCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer"
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
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer font-mono"
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
              placeholder="شناسه/آدرس"
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all font-mono"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={!newPlatformName.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن</span>
            </button>
          </div>
        </form>

        {/* Platforms list */}
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
                  onClick={() => handleTogglePlatform(plat.id)}
                  className={`w-3 h-3 rounded-full cursor-pointer shrink-0 transition-colors ${
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
                  onClick={() => handleTogglePlatform(plat.id)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                    plat.isEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {plat.isEnabled ? 'فعال' : 'غیرفعال'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePlatform(plat.id, plat.name)}
                  className="p-1.5 bg-slate-200 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
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
            className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازگردانی دسته‌بندی‌های پیش‌فرض</span>
          </button>
        </div>

        {/* Add new category input */}
        <form onSubmit={handleAddCategory} className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <FolderPlus className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              placeholder="افزودن دسته‌بندی جدید (مثال: مستندسازی و آرشیو، پادکست و صدا، پویش تبلیغاتی)..."
              className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!newCatInput.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن دسته‌بندی</span>
          </button>
        </form>

        {/* Categories List */}
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
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
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
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* Org Profile */}
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Building className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">مشخصات سازمان و فضای کاری</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                نام سازمان / شرکت
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                شناسه دامنه فضای کاری (Slug)
              </label>
              <div className="flex items-center" dir="ltr">
                <span className="px-3 py-2.5 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-xs text-slate-500 font-mono">
                  app.tadbir.ir/
                </span>
                <input
                  type="text"
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-r-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                طول دوره اسپرینت پیش‌فرض
              </label>
              <select
                value={defaultSprintLength}
                onChange={(e) => setDefaultSprintLength(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden font-medium cursor-pointer"
              >
                <option value="1 week">اسپرینت‌های ۱ هفته‌ای</option>
                <option value="2 weeks">اسپرینت‌های ۲ هفته‌ای (استاندارد)</option>
                <option value="3 weeks">اسپرینت‌های ۳ هفته‌ای</option>
                <option value="4 weeks">اسپرینت‌های ۴ هفته‌ای (ماهانه)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security Policies */}
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Lock className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">سیاست‌های امنیتی و احراز هویت</h3>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
              <div>
                <span className="font-bold text-slate-800 block">الزام احراز هویت دو مرحله‌ای (2FA) برای تمامی پرسنل</span>
                <span className="text-slate-500">کاربران بدون تأیید پیامکی یا TOTP اجازه ورود به سامانه‌های حساس را نخواهند داشت.</span>
              </div>
              <input
                type="checkbox"
                checked={twoFactorEnforced}
                onChange={(e) => setTwoFactorEnforced(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-sm"
              />
            </label>
          </div>
        </div>

        {/* Notifications Config */}
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Bell className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">تنظیمات اعلانات و هشدارها</h3>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
              <div>
                <span className="font-bold text-slate-800 block">هشدار تخصیص تسک و وظیفه جدید</span>
                <span className="text-slate-500">ارسال نوتیفیکیشن درون برنامه‌ای و ایمیلی به محض ارجاع کار</span>
              </div>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-sm"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
              <div>
                <span className="font-bold text-slate-800 block">هشدار سررسید و تسک‌های دارای تأخیر</span>
                <span className="text-slate-500">اعلان ۲۴ ساعت قبل از رسیدن موعد تحویل یا بروز تأخیر</span>
              </div>
              <input
                type="checkbox"
                checked={deadlineReminders}
                onChange={(e) => setDeadlineReminders(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-sm"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
              <div>
                <span className="font-bold text-slate-800 block">یادداشت‌ها و منشن‌ها (@mention)</span>
                <span className="text-slate-500">اطلاع‌رسانی بلادرنگ هنگام منشن شدن در دیدگاه‌های پروژه‌ها</span>
              </div>
              <input
                type="checkbox"
                checked={mentionAlerts}
                onChange={(e) => setMentionAlerts(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-sm"
              />
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end pt-4">
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>ذخیره تغییرات</span>
          </button>
        </div>
      </form>

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
