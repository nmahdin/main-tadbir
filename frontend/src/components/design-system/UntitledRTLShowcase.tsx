import React, { useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowUpLeft, Bell, BookOpen, Check, CheckCircle2,
  ChevronDown, ChevronLeft, CircleHelp, Clock3, FileText, Filter, Globe2,
  LayoutDashboard, MoreHorizontal, Plus, Search, Settings2, Share2, ShieldCheck,
  Sparkles, Users, X
} from 'lucide-react';

const channels = [
  { name: 'وب‌سایت', handle: 'tadbir.example.ir', color: 'bg-indigo-50 text-indigo-700', initial: 'W', enabled: true },
  { name: 'خبرنامه', handle: 'weekly@tadbir.example', color: 'bg-emerald-50 text-emerald-700', initial: 'N', enabled: true },
  { name: 'شبکه اجتماعی', handle: '@tadbir_media', color: 'bg-sky-50 text-sky-700', initial: 'S', enabled: false },
];

const articles = [
  { title: 'گزارش هفتگی فعالیت‌های تیم', type: 'گزارش', owner: 'سارا احمدی', date: 'امروز، ۱۰:۳۰', status: 'منتشرشده', tone: 'bg-emerald-50 text-emerald-700' },
  { title: 'راهنمای شروع فضای کاری', type: 'راهنما', owner: 'علی رضایی', date: 'دیروز، ۱۶:۱۵', status: 'در حال بازبینی', tone: 'bg-amber-50 text-amber-700' },
  { title: 'برنامه محتوایی هفته آینده', type: 'برنامه', owner: 'مریم کریمی', date: '۱۲ مهر، ۰۹:۲۰', status: 'پیش‌نویس', tone: 'bg-slate-100 text-slate-600' },
  { title: 'جمع‌بندی جلسه هماهنگی', type: 'صورت‌جلسه', owner: 'محمد موسوی', date: '۱۱ مهر، ۱۳:۰۰', status: 'منتشرشده', tone: 'bg-emerald-50 text-emerald-700' },
];

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl bg-white shadow-[0_8px_26px_-12px_rgba(15,23,42,0.18),0_2px_8px_-4px_rgba(15,23,42,0.08)] ${className}`}>{children}</section>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold text-slate-500">{children}</p>;
}

export default function UntitledRTLShowcase() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('همه');
  const [enabledChannels, setEnabledChannels] = useState<string[]>(channels.filter(channel => channel.enabled).map(channel => channel.name));
  const [showNotice, setShowNotice] = useState(true);
  const [showCreateNotice, setShowCreateNotice] = useState(false);
  const visibleArticles = articles.filter(article =>
    (activeTab === 'همه' || article.status === activeTab) &&
    `${article.title} ${article.owner} ${article.type}`.includes(search.trim())
  );

  return <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-4 bg-white px-4 shadow-[0_4px_18px_-14px_rgba(15,23,42,0.25)] sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><LayoutDashboard size={19}/></div>
        <div className="min-w-0"><p className="truncate text-sm font-black">تدبیر جامع</p><p className="mt-0.5 text-[11px] text-slate-500">نمونه صفحه · الگوی RTL</p></div>
        <span className="hidden rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700 sm:inline-flex">آزمایشی</span>
      </div>
      <div className="hidden w-full max-w-sm items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-400 md:flex"><Search size={16}/><input aria-label="جست‌وجو در محتوا" value={search} onChange={event => setSearch(event.target.value)} placeholder="جست‌وجو در محتوا…" className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"/></div>
      <div className="flex items-center gap-2"><button type="button" aria-label="راهنما" className="rounded-xl bg-slate-50 p-2.5 text-slate-500 hover:bg-slate-100"><CircleHelp size={17}/></button><button type="button" aria-label="اعلان‌ها" className="relative rounded-xl bg-slate-50 p-2.5 text-slate-500 hover:bg-slate-100"><Bell size={17}/><span className="absolute end-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500"/></button><div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700">ع‌م</div></div>
    </header>

    <div className="mx-auto flex max-w-[1500px]">
      <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-60 shrink-0 flex-col bg-white p-4 shadow-[8px_0_28px_-18px_rgba(15,23,42,0.2)] lg:flex">
        <div className="mb-7 rounded-2xl bg-slate-50 p-4"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><Sparkles size={18}/></div><p className="text-sm font-extrabold">فضای محتوایی</p><p className="mt-1 text-xs leading-5 text-slate-500">نمایش الگوی راست‌چین و اجزای کاربردی</p></div>
        <p className="mb-3 px-3 text-[10px] font-bold text-slate-400">فضای کاری</p>
        <nav className="space-y-1">
          {[{label:'نمای کلی',icon:LayoutDashboard},{label:'محتوا',icon:FileText},{label:'اعضای تیم',icon:Users},{label:'گزارش فعالیت',icon:Activity}].map(({label,icon:Icon}, index) => <button key={label} type="button" className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-xs font-bold ${index===0?'bg-indigo-50 text-indigo-700':'text-slate-600 hover:bg-slate-50'}`}><Icon size={17}/>{label}{index===0&&<ChevronLeft className="me-auto" size={15}/>}</button>)}
        </nav>
        <div className="mt-auto rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold"><ShieldCheck size={16} className="text-emerald-600"/> اصول طراحی</div><p className="mt-2 text-[11px] leading-5 text-slate-500">چیدمان آینه‌ای، متن خوانا و کنترل‌های هم‌راستا.</p></div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><div className="mb-2 flex items-center gap-2 text-xs text-slate-500"><span>فضای کاری</span><ChevronLeft size={13}/><span className="font-bold text-slate-700">محتوا</span></div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">سلام، وقت بخیر</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">نمایی از داشبورد مدیریت محتوا با الگوهای راست‌چین، کارت‌های آماری، وضعیت‌ها و جدول قابل جست‌وجو.</p></div>
          <div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => setShowCreateNotice(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><Plus size={15}/>ایجاد محتوا</button><button type="button" onClick={() => setShowNotice(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200"><Settings2 size={15}/>تنظیمات نمایش</button></div>
        </div>

        {showNotice && <div className="mb-6 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 shadow-sm"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600"><CheckCircle2 size={18}/></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">همه‌چیز آمادهٔ انتشار است</p><p className="mt-1 text-xs leading-6 text-emerald-800">این پیام نمونه نشان می‌دهد اعلان‌ها و دکمهٔ بستن در رابط راست‌چین چگونه کنار هم قرار می‌گیرند.</p></div><button type="button" aria-label="بستن پیام" onClick={() => setShowNotice(false)} className="rounded-lg bg-white p-1.5 text-emerald-700 hover:bg-emerald-100"><X size={16}/></button></div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[{label:'محتوای ثبت‌شده',value:'۱۲۸',change:'+۱۲٪',icon:FileText,tone:'bg-indigo-50 text-indigo-700'},{label:'در انتظار بازبینی',value:'۰۹',change:'۳ مورد جدید',icon:Clock3,tone:'bg-amber-50 text-amber-700'},{label:'اعضای فعال',value:'۲۴',change:'از ۳۰ عضو',icon:Users,tone:'bg-sky-50 text-sky-700'},{label:'نرخ انتشار',value:'۸۶٪',change:'این ماه',icon:Activity,tone:'bg-emerald-50 text-emerald-700'}].map(({label,value,change,icon:Icon,tone})=><Surface key={label} className="p-4"><div className="flex items-start justify-between"><span className="text-xs font-semibold text-slate-500">{label}</span><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17}/></span></div><p className="mt-4 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-500">{change}</p></Surface>)}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
          <Surface className="overflow-hidden">
            <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><h2 className="text-base font-extrabold">محتواهای اخیر</h2><p className="mt-1 text-xs text-slate-500">پیگیری وضعیت و مسئول هر مورد</p></div><div className="flex items-center gap-2"><button type="button" className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"><Filter size={14}/>فیلتر</button><button type="button" className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><Plus size={14}/>مورد جدید</button></div></div>
            <div className="flex flex-wrap gap-1 px-5 pb-4">{['همه','منتشرشده','در حال بازبینی','پیش‌نویس'].map(tab=><button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-lg px-3 py-2 text-xs font-bold ${activeTab===tab?'bg-indigo-50 text-indigo-700':'text-slate-500 hover:bg-slate-50'}`}>{tab}</button>)}</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-right text-xs"><thead className="bg-slate-50 text-[11px] text-slate-500"><tr><th className="px-5 py-3 font-semibold">عنوان</th><th className="px-4 py-3 font-semibold">نوع</th><th className="px-4 py-3 font-semibold">مسئول</th><th className="px-4 py-3 font-semibold">آخرین تغییر</th><th className="px-5 py-3 font-semibold">وضعیت</th><th className="px-4 py-3"/></tr></thead><tbody>{visibleArticles.length ? visibleArticles.map(article=><tr key={article.title} className="border-t border-slate-100"><td className="px-5 py-4 font-bold text-slate-800">{article.title}</td><td className="px-4 py-4 text-slate-500">{article.type}</td><td className="px-4 py-4 text-slate-600">{article.owner}</td><td className="px-4 py-4 whitespace-nowrap text-slate-500">{article.date}</td><td className="px-5 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${article.tone}`}>{article.status}</span></td><td className="px-4 py-4"><button type="button" aria-label={`گزینه‌های ${article.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><MoreHorizontal size={16}/></button></td></tr>) : <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">موردی با این مشخصات پیدا نشد.</td></tr>}</tbody></table></div>
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-5 py-3 text-[11px] text-slate-500"><span>{visibleArticles.length} مورد نمایش داده می‌شود</span><div className="flex items-center gap-2"><button type="button" disabled className="rounded-lg bg-white px-3 py-1.5 text-slate-400">قبلی</button><button type="button" className="rounded-lg bg-white px-3 py-1.5 font-bold text-slate-700">بعدی</button></div></div>
          </Surface>

          <div className="space-y-6">
            <Surface className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-extrabold">کانال‌های انتشار</h2><p className="mt-1 text-xs text-slate-500">فعال‌سازی کانال‌ها در این نمونه</p></div><button type="button" aria-label="گزینه‌های کانال‌ها" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><MoreHorizontal size={17}/></button></div><div className="space-y-4">{channels.map(channel=>{const enabled=enabledChannels.includes(channel.name);return <div key={channel.name} className="flex items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black ${channel.color}`}>{channel.initial}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800">{channel.name}</p><p className="mt-1 truncate text-[10px] text-slate-500" dir="ltr">{channel.handle}</p></div><button type="button" role="switch" aria-checked={enabled} aria-label={`فعال‌سازی ${channel.name}`} onClick={() => setEnabledChannels(current=>enabled?current.filter(name=>name!==channel.name):[...current,channel.name])} className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 ${enabled?'bg-indigo-600':'bg-slate-200'}`}><span className={`block h-5 w-5 rounded-full bg-white shadow-sm ${enabled?'translate-x-0':'-translate-x-5'}`}/></button></div>})}</div><div className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500"><Globe2 size={14} className="mb-1 text-slate-400"/>تغییر کلیدها فقط در این پیش‌نمایش اعمال می‌شود.</div></Surface>

            <Surface className="p-5"><div className="mb-4 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><BookOpen size={17}/></span><div><h2 className="text-sm font-extrabold">نکتهٔ RTL</h2><p className="mt-1 text-xs text-slate-500">راست‌چین فراتر از متن است</p></div></div><p className="text-xs leading-6 text-slate-600">ترتیب آیکون، جای دکمهٔ بستن، جهت فلش‌ها و فاصله‌گذاری باید با جهت رابط هماهنگ باشد؛ نه اینکه فقط متن به سمت راست برود.</p><div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><p className="text-xs font-bold">مستندات مرجع</p><p className="mt-1 text-[10px] text-slate-500">الگوی طراحی راست‌چین</p></div><a href="https://www.untitledui.com/react/docs/rtl" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-800">مطالعه <ArrowUpLeft size={14}/></a></div></Surface>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 shadow-[0_4px_18px_-12px_rgba(15,23,42,0.18)]"><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={15} className="text-emerald-600"/>این صفحه صرفاً نمونهٔ طراحی است و دادهٔ واقعی را تغییر نمی‌دهد.</div><button type="button" onClick={() => {setSearch('');setActiveTab('همه');setEnabledChannels(channels.filter(channel=>channel.enabled).map(channel=>channel.name));setShowNotice(true);}} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"><X size={14}/>بازنشانی نمونه</button></div>
      </main>
    </div>

    {showCreateNotice && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4" role="presentation" onClick={() => setShowCreateNotice(false)}><section role="dialog" aria-modal="true" aria-labelledby="sample-dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}><header className="flex items-center justify-between gap-4 bg-slate-50 px-5 py-4"><h2 id="sample-dialog-title" className="text-sm font-extrabold">ایجاد محتوای نمونه</h2><button type="button" aria-label="بستن پنجره" onClick={() => setShowCreateNotice(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600"><X size={17}/></button></header><div className="p-5"><p className="text-xs leading-6 text-slate-600">این پنجره برای نمایش چیدمان مدال در رابط راست‌چین است. هیچ محتوایی ذخیره نمی‌شود.</p><div className="mt-5 flex justify-start gap-2"><button type="button" onClick={() => setShowCreateNotice(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200">انصراف</button><button type="button" onClick={() => setShowCreateNotice(false)} className="rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><Check size={15} className="me-1 inline"/>متوجه شدم</button></div></div></section></div>}
  </div>;
}
