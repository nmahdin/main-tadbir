import React, { useState } from 'react';
import {
  Activity, Bell, BookOpen, BriefcaseBusiness, Check, ChevronDown, ChevronLeft,
  CircleHelp, Command, FileText, FolderKanban, Gauge, LayoutGrid, Menu, MoreHorizontal,
  Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Users, X, Sparkles, CheckCircle2,
  AlertTriangle, Info, CircleX, ArrowUpLeft, Palette, Type, Ruler, Component
} from 'lucide-react';

const colors = [
  { name: 'اصلی', value: '#4F46E5', usage: 'اقدام اصلی و لینک‌ها' },
  { name: 'موفقیت', value: '#16A34A', usage: 'عملیات موفق و وضعیت فعال' },
  { name: 'هشدار', value: '#D97706', usage: 'نیازمند توجه' },
  { name: 'خطا', value: '#DC2626', usage: 'خطا و اقدام مخرب' },
  { name: 'اطلاع', value: '#0284C7', usage: 'پیام‌های راهنما' },
  { name: 'متن', value: '#0F172A', usage: 'متن اصلی' },
];

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-5"><p className="text-xs font-bold tracking-wide text-indigo-600">{eyebrow}</p><h2 className="mt-1 text-lg font-black text-slate-900">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>;
}
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-white/80 bg-white p-5  ring-1 ring-slate-900/[0.04] ${className}`}>{children}</section>;
}
function TinyLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-bold text-slate-500">{children}</p>;
}

export default function DesignSystemView() {
  const [activeNav, setActiveNav] = useState('نمای کلی');
  const [activeTab, setActiveTab] = useState('همه');
  const [showToast, setShowToast] = useState(false);
  const [darkPreview, setDarkPreview] = useState(false);
  const [query, setQuery] = useState('');
  const navItems = [
    { label: 'نمای کلی', icon: LayoutGrid },
    { label: 'رنگ و تایپوگرافی', icon: Palette },
    { label: 'کامپوننت‌ها', icon: Component },
    { label: 'فرم‌ها و داده‌ها', icon: FileText },
    { label: 'الگوهای صفحه', icon: Gauge },
  ];

  return <div dir="rtl" className={`min-h-screen bg-slate-50 text-slate-900 ${darkPreview ? 'ds-dark-preview' : ''}`}>
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4  sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white border border-slate-700 "><Command size={21} /></div>
        <div><p className="text-sm font-black">تدبیر جامع</p><p className="text-[11px] text-slate-500">راهنمای زبان طراحی</p></div>
        <span className="mr-2 hidden rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700 sm:inline-flex">پیش‌نمایش</span>
      </div>
      <div className="hidden w-full max-w-sm items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 md:flex"><Search size={16} /><input aria-label="جست‌وجو در راهنما" value={query} onChange={e => setQuery(e.target.value)} placeholder="جست‌وجو در راهنمای طراحی…" className="w-full border-0 bg-transparent text-xs outline-none placeholder:text-slate-400" /><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></div>
      <div className="flex items-center gap-2"><button aria-label="اعلان‌ها" className="relative rounded-2xl p-2 text-slate-500 hover:bg-slate-100"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></button><div className="hidden h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 sm:flex">ع‌م</div></div>
    </header>
    <div className="mx-auto flex max-w-[1600px]">
      <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-64 shrink-0 flex-col border-l border-slate-200 bg-white p-4 lg:flex">
        <div className="mb-5 rounded-2xl border border-white bg-slate-50 p-4 "><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-indigo-600 "><Sparkles size={19} /></div><p className="text-sm font-extrabold">Design System</p><p className="mt-1 text-xs leading-5 text-slate-500">نسخهٔ اولیه برای یکپارچگی تجربهٔ تدبیر</p></div>
        <p className="mb-2 px-3 text-[10px] font-bold text-slate-400">مستندات طراحی</p>
        <nav className="space-y-1">{navItems.map(({label, icon: Icon}) => <button key={label} onClick={() => {setActiveNav(label); document.getElementById(label)?.scrollIntoView({behavior:'auto',block:'start'});}} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-right text-xs font-bold ${activeNav===label?'bg-indigo-50 text-indigo-700':'text-slate-600 hover:bg-slate-50'}`}><Icon size={17}/>{label}{activeNav===label&&<ChevronLeft className="mr-auto" size={15}/>}</button>)}</nav>
        <div className="mt-auto rounded-2xl border border-slate-200 p-3"><div className="flex items-center gap-2 text-xs font-bold"><ShieldCheck size={16} className="text-emerald-600"/> اصول طراحی</div><p className="mt-2 text-[11px] leading-5 text-slate-500">خوانایی، دسترس‌پذیری، RTL و سازگاری در تمام ماژول‌ها.</p></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div id="نمای کلی" className="scroll-mt-24 mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><div className="mb-2 flex items-center gap-2 text-xs text-slate-500"><span>مستندات</span><ChevronLeft size={13}/><span className="font-bold text-slate-700">زبان طراحی</span></div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">یک زبان مشترک برای تدبیر</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">مرجع رنگ‌ها، تایپوگرافی، فاصله‌ها و اجزای رابط کاربری. این صفحه نمونهٔ مستقل است و روی صفحات فعلی سامانه تغییری ایجاد نمی‌کند.</p></div>
          <div className="flex shrink-0 gap-2"><button onClick={() => setDarkPreview(v=>!v)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700  hover:bg-slate-50 active: active:"><SlidersHorizontal size={15}/>{darkPreview?'حالت روشن':'پیش‌نمایش تیره'}</button><button onClick={()=>setShowToast(true)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-700 px-3.5 py-2.5 text-xs font-bold text-white  border border-slate-800  hover:bg-slate-800 active:"><Check size={15}/>آزمایش پیام</button></div>
        </div>
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {label:'رنگ‌های پایه',value:'۶',note:'توکن‌های معنایی',icon:Palette,tone:'bg-indigo-50 text-indigo-700'},
            {label:'مقیاس فاصله',value:'۴ تا ۳۲',note:'بر پایهٔ ۴ پیکسل',icon:Ruler,tone:'bg-sky-50 text-sky-700'},
            {label:'فونت رابط',value:'Vazirmatn',note:'فارسی و لاتین',icon:Type,tone:'bg-emerald-50 text-emerald-700'},
            {label:'جهت رابط',value:'RTL',note:'فارسی، راست‌چین',icon:ArrowUpLeft,tone:'bg-amber-50 text-amber-700'}
          ].map(({label,value,note,icon:Icon,tone})=><Panel key={label} className="p-4"><div className="flex items-start justify-between"><span className="text-xs font-bold text-slate-500">{label}</span><span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${tone}`}><Icon size={17}/></span></div><p className="mt-3 text-xl font-black">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></Panel>)}
        </div>

        <section id="رنگ و تایپوگرافی" className="scroll-mt-24 mb-8">
          <SectionTitle eyebrow="FOUNDATIONS / 01" title="رنگ، تایپوگرافی و فاصله‌گذاری" description="توکن‌های اولیه از استایل موجود پروژه الهام گرفته شده‌اند؛ تغییر نهایی پالت پس از بازبینی انجام می‌شود."/>
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-extrabold">پالت معنایی</h3><span className="text-[11px] text-slate-400">رنگ + کاربرد</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{colors.map(c=><div key={c.name} className="rounded-2xl border border-slate-100 p-2.5"><div className="mb-3 h-14 rounded-xl" style={{backgroundColor:c.value}}/><p className="text-xs font-extrabold">{c.name}</p><p className="mt-1 font-mono text-[10px] text-slate-500" dir="ltr">{c.value}</p><p className="mt-1 text-[10px] text-slate-500">{c.usage}</p></div>)}</div></Panel>
            <Panel><h3 className="mb-4 text-sm font-extrabold">تایپوگرافی</h3><div className="space-y-4">{[{name:'عنوان صفحه',sample:'مدیریت فضای کاری',size:'۲۴ / ۳۲',weight:'Black'},{name:'عنوان بخش',sample:'اعضای تیم',size:'۱۸ / ۲۸',weight:'Bold'},{name:'متن اصلی',sample:'اطلاعات را واضح و خوانا نمایش دهید.',size:'۱۴ / ۲۴',weight:'Regular'},{name:'توضیح کمکی',sample:'آخرین به‌روزرسانی چند دقیقه پیش',size:'۱۲ / ۲۰',weight:'Regular'}].map(t=><div key={t.name} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"><div className="mb-1 flex justify-between gap-2 text-[10px] text-slate-400"><span>{t.name}</span><span>{t.size} px · {t.weight}</span></div><p className={t.name==='عنوان صفحه'?'text-xl font-black':t.name==='عنوان بخش'?'text-base font-bold':t.name==='متن اصلی'?'text-sm':'text-xs text-slate-500'}>{t.sample}</p></div>)}</div></Panel>
            <Panel className="xl:col-span-3"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-extrabold">مقیاس فاصله‌ها و گوشه‌ها</h3><span className="text-[11px] text-slate-400">مقادیر پایه</span></div><div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{[4,8,12,16,24,32].map(n=><div key={n} className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-3"><div className="rounded-md bg-indigo-200" style={{width:n,height:n}}/><span className="text-xs font-bold">{n}px</span></div>)}</div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[{name:'کوچک',value:'۶px'},{name:'متوسط',value:'۱۲px'},{name:'بزرگ',value:'۱۶px'},{name:'کارت',value:'۲۰px'}].map(r=><div key={r.name} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><div className="h-9 w-9 border-2 border-indigo-200 bg-indigo-50" style={{borderRadius:r.value.replace('px','')+'px'}}/><div><p className="text-xs font-bold">{r.name}</p><p className="mt-1 text-[10px] text-slate-500">{r.value} شعاع گوشه</p></div></div>)}</div></Panel>
          </div>
        </section>

        <section id="کامپوننت‌ها" className="scroll-mt-24 mb-8">
          <SectionTitle eyebrow="COMPONENTS / 02" title="کامپوننت‌های پایه" description="اجزا باید حالت عادی، تعاملی، غیرفعال و خطا را با رفتار قابل پیش‌بینی نمایش دهند."/>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel><div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="mb-2 text-xs font-bold text-slate-600">سبک سه‌بعدی بدون انیمیشن</p><p className="mb-3 text-xs leading-6 text-slate-500">عمق با لبهٔ پایینی تیره‌تر و حاشیه ساخته شده است؛ بدون سایه و بدون حرکت.</p><div className="flex flex-wrap items-center gap-3"><button className="rounded-2xl border border-slate-300 border-b-[3px] bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 active:border-b border-b-slate-400">خنثی</button><button className="rounded-2xl border border-blue-700 border-b-[3px] bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 active:border-b border-b-blue-800">اقدام اصلی</button><button className="rounded-2xl border border-emerald-700 border-b-[3px] bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 active:border-b border-b-emerald-800">تأیید</button><button className="rounded-2xl border border-rose-700 border-b-[3px] bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 active:border-b border-b-rose-800">حذف</button></div></div><h3 className="mb-4 text-sm font-extrabold">دکمه‌ها؛ مقایسهٔ عمق و رنگ</h3><div className="space-y-5"><div><p className="mb-2 text-xs font-bold text-slate-500">سایهٔ درونی · عمق از داخل دکمه</p><div className="flex flex-wrap items-center gap-3"><button className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800  hover:bg-slate-50 active:">دکمهٔ خنثی</button><button className="rounded-2xl border border-blue-700 bg-blue-600 px-4 py-2.5 text-xs font-bold text-white  hover:bg-blue-700 active:">اقدام اصلی</button><button className="rounded-2xl border border-emerald-700 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white  hover:bg-emerald-700 active:">تأیید</button><button className="rounded-2xl border border-rose-700 bg-rose-600 px-4 py-2.5 text-xs font-bold text-white  hover:bg-rose-700 active:">حذف</button></div></div><div><p className="mb-2 text-xs font-bold text-slate-500">سایهٔ بیرونی · برجستگی از سطح صفحه</p><div className="flex flex-wrap items-center gap-3"><button className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800  hover:bg-slate-50 active:">دکمهٔ خنثی</button><button className="rounded-2xl border border-blue-700 bg-blue-600 px-4 py-2.5 text-xs font-bold text-white  hover:bg-blue-700 active:">اقدام اصلی</button><button className="rounded-2xl border border-emerald-700 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white  hover:bg-emerald-700 active:">تأیید</button><button className="rounded-2xl border border-rose-700 bg-rose-600 px-4 py-2.5 text-xs font-bold text-white  hover:bg-rose-700 active:">حذف</button></div></div></div><p className="mt-4 text-xs leading-6 text-slate-500">ارتفاع کنترل‌ها باید در فرم‌ها ثابت باشد. هر صفحه فقط یک اقدام اصلی برجسته داشته باشد.</p></Panel>
            <Panel><h3 className="mb-4 text-sm font-extrabold">وضعیت‌ها و برچسب‌ها</h3><div className="flex flex-wrap gap-2">{[{name:'فعال',c:'bg-emerald-50 text-emerald-700 ring-emerald-600/15'},{name:'در انتظار',c:'bg-amber-50 text-amber-700 ring-amber-600/15'},{name:'پیش‌نویس',c:'bg-slate-100 text-slate-700 ring-slate-500/15'},{name:'نیازمند بررسی',c:'bg-sky-50 text-sky-700 ring-sky-600/15'},{name:'خطا',c:'bg-rose-50 text-rose-700 ring-rose-600/15'}].map(b=><span key={b.name} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ring-inset ${b.c}`}>{b.name}</span>)}</div><div className="mt-5 space-y-2"><div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 size={17}/><span>تغییرات با موفقیت ذخیره شد.</span></div><div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={17}/><span>پیش از ادامه، اطلاعات را بررسی کنید.</span></div><div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800"><Info size={17}/><span>می‌توانید این تنظیم را بعداً تغییر دهید.</span></div><div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><CircleX size={17}/><span>ذخیره‌سازی انجام نشد؛ دوباره تلاش کنید.</span></div></div></Panel>
          </div>
        </section>

        <section id="فرم‌ها و داده‌ها" className="scroll-mt-24 mb-8">
          <SectionTitle eyebrow="PATTERNS / 03" title="فرم‌ها، جدول و کارت" description="فاصله‌گذاری و سلسله‌مراتب بصری به کاربر کمک می‌کند اطلاعات را سریع‌تر اسکن کند."/>
          <div className="grid gap-4 xl:grid-cols-5">
            <Panel className="xl:col-span-2"><h3 className="mb-4 text-sm font-extrabold">نمونه فرم</h3><form onSubmit={e=>{e.preventDefault();setShowToast(true)}} className="space-y-4"><div><TinyLabel>عنوان</TinyLabel><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="مثلاً برنامه‌ریزی هفتگی" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs  outline-none focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-500/10"/></div><div><TinyLabel>دسته‌بندی</TinyLabel><div className="relative"><select defaultValue="" className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs  outline-none focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-500/10"><option value="" disabled>انتخاب دسته‌بندی</option><option>برنامه‌ریزی</option><option>منابع انسانی</option><option>محتوا</option></select><ChevronDown size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/></div></div><div><TinyLabel>توضیحات</TinyLabel><textarea rows={3} placeholder="توضیحات تکمیلی را وارد کنید…" className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs  outline-none focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-500/10"/></div><div className="flex justify-end gap-2"><button type="button" className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-bold">انصراف</button><button className="rounded-2xl bg-slate-700 px-4 py-2 text-xs font-bold text-white border border-slate-800  hover:bg-slate-800 active:">ذخیره</button></div></form></Panel>
            <Panel className="xl:col-span-3"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-extrabold">اعضای فضای کاری</h3><button onClick={()=>setActiveTab('همه')} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><Plus size={14}/>افزودن عضو</button></div><div className="mb-3 flex gap-1 rounded-2xl bg-slate-100 p-1">{['همه','فعال','در انتظار'].map(t=><button key={t} onClick={()=>setActiveTab(t)} className={`rounded-xl px-3 py-1.5 text-[11px] font-bold ${activeTab===t?'bg-white text-indigo-700 ':'text-slate-500 hover:text-slate-800'}`}>{t}</button>)}</div><div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead><tr className="border-b border-slate-100 text-slate-500"><th className="px-2 py-3 font-bold">نام</th><th className="px-2 py-3 font-bold">نقش</th><th className="px-2 py-3 font-bold">وضعیت</th><th className="px-2 py-3 font-bold">عملیات</th></tr></thead><tbody>{[{name:'علی محمدی',role:'مدیر فضای کاری',status:'فعال'},{name:'سارا احمدی',role:'عضو',status:'فعال'},{name:'محمد رضایی',role:'عضو',status:'در انتظار'}].filter(r=>activeTab==='همه'||r.status===activeTab).map(r=><tr key={r.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70"><td className="px-2 py-3 font-bold">{r.name}</td><td className="px-2 py-3 text-slate-500">{r.role}</td><td className="px-2 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${r.status==='فعال'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{r.status}</span></td><td className="px-2 py-3"><button aria-label={`عملیات ${r.name}`} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200"><MoreHorizontal size={16}/></button></td></tr>)}</tbody></table></div><div className="mt-3 flex items-center justify-between text-[10px] text-slate-400"><span>نمایش {activeTab==='همه'?'۳':'موارد فیلترشده'} از ۳ عضو</span><div className="flex gap-1"><button aria-label="صفحه قبل" className="rounded-xl border border-slate-200 p-1.5"><ChevronDown size={13} className="rotate-90"/></button><button className="rounded-xl bg-indigo-600 px-2.5 py-1 text-white">۱</button><button aria-label="صفحه بعد" className="rounded-xl border border-slate-200 p-1.5"><ChevronDown size={13} className="-rotate-90"/></button></div></div></Panel>
          </div>
        </section>

        <section id="الگوهای صفحه" className="scroll-mt-24 mb-8">
          <SectionTitle eyebrow="LAYOUTS / 04" title="الگوی چیدمان و دسترس‌پذیری" description="ظاهر فقط بخشی از طراحی است؛ مسیر صفحه، تمرکز صفحه‌کلید، کنتراست و رفتار در نمایشگر کوچک هم مهم‌اند."/>
          <div className="grid gap-4 md:grid-cols-3">
            <Panel><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><FolderKanban size={19}/></div><h3 className="text-sm font-extrabold">ساختار روشن</h3><p className="mt-2 text-xs leading-6 text-slate-500">عنوان، توضیح، اقدام اصلی و محتوای صفحه همیشه جای مشخصی دارند.</p></Panel>
            <Panel><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CircleHelp size={19}/></div><h3 className="text-sm font-extrabold">بازخورد قابل فهم</h3><p className="mt-2 text-xs leading-6 text-slate-500">برای عملیات موفق، خطا و انتظار، پیام واضح و قابل دسترس ارائه می‌شود.</p></Panel>
            <Panel><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Users size={19}/></div><h3 className="text-sm font-extrabold">RTL و واکنش‌گرا</h3><p className="mt-2 text-xs leading-6 text-slate-500">در موبایل، محتوا بدون اسکرول افقی غیرضروری و با ترتیب منطقی نمایش داده می‌شود.</p></Panel>
          </div>
        </section>
        <footer className="flex flex-col justify-between gap-2 border-t border-slate-200 py-5 text-[11px] text-slate-400 sm:flex-row"><span>تدبیر جامع · زبان طراحی نسخهٔ ۰.۱</span><span>React · TypeScript · Tailwind CSS v4 · Vazirmatn</span></footer>
      </main>
    </div>
    {showToast&&<div role="status" className="fixed bottom-5 left-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-xs font-bold text-slate-800 "><CheckCircle2 className="shrink-0 text-emerald-600" size={19}/><span>این یک پیام آزمایشی است؛ عملیات واقعی انجام نشده.</span><button aria-label="بستن پیام" onClick={()=>setShowToast(false)} className="mr-2 rounded-xl p-1 text-slate-400 hover:bg-slate-100"><X size={15}/></button></div>}
    <style>{`.ds-dark-preview { background:#0f172a; color:#e2e8f0; } .ds-dark-preview main > section, .ds-dark-preview main > div > section { border-color:#334155; background:#1e293b; } .ds-dark-preview main h1,.ds-dark-preview main h2,.ds-dark-preview main h3,.ds-dark-preview main p { } .ds-dark-preview header,.ds-dark-preview aside { background:#111827; border-color:#334155; color:#e2e8f0; } .ds-dark-preview .bg-white { background:#1e293b; } .ds-dark-preview .border-slate-200 { border-color:#334155; } .ds-dark-preview .text-slate-500,.ds-dark-preview .text-slate-600,.ds-dark-preview .text-slate-400 { color:#94a3b8; }`}</style>
  </div>;
}
