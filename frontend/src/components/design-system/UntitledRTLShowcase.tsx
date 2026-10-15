import React, { useState } from 'react';
import {
  Activity, ArrowUpRight, Bell, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Command, Download, Filter, Home, Layers, Menu, Plus, Search,
  Settings, Users, X
} from 'lucide-react';

type IconType = React.ComponentType<{ className?: string; size?: number }>;

const nav = [
  { label: 'نمای کلی', icon: Home },
  { label: 'محتوا', icon: Layers },
  { label: 'اعضای تیم', icon: Users },
  { label: 'گزارش فعالیت', icon: Activity },
];
const rows = [
  { title: 'راهنمای شروع فضای کاری', kind: 'راهنما', owner: 'سارا احمدی', date: '۱۵ مهر ۱۴۰۵', status: 'منتشرشده', tone: 'success' },
  { title: 'گزارش هفتگی فعالیت‌ها', kind: 'گزارش', owner: 'علی رضایی', date: '۱۴ مهر ۱۴۰۵', status: 'در حال بازبینی', tone: 'warning' },
  { title: 'برنامه محتوایی هفته آینده', kind: 'برنامه', owner: 'مریم کریمی', date: '۱۳ مهر ۱۴۰۵', status: 'پیش‌نویس', tone: 'gray' },
  { title: 'جمع‌بندی جلسه هماهنگی', kind: 'صورت‌جلسه', owner: 'محمد موسوی', date: '۱۲ مهر ۱۴۰۵', status: 'منتشرشده', tone: 'success' },
];
const metrics = [
  { label: 'محتوای ثبت‌شده', value: '۱۲۸', detail: '۱۲٪ افزایش نسبت به ماه قبل', icon: Layers, positive: true },
  { label: 'در انتظار بازبینی', value: '۰۹', detail: '۳ مورد جدید امروز', icon: Activity, positive: false },
  { label: 'اعضای فعال', value: '۲۴', detail: 'از ۳۰ عضو فضای کاری', icon: Users, positive: true },
  { label: 'نرخ انتشار', value: '۸۶٪', detail: 'در ۳۰ روز گذشته', icon: ArrowUpRight, positive: true },
];

function Button({ children, variant = 'secondary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'tertiary'; children: React.ReactNode }) {
  const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:pointer-events-none disabled:opacity-50';
  const styles = {
    primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
    tertiary: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
  };
  return <button {...props} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
}
function IconButton({ icon: Icon, label, onClick }: { icon: IconType; label: string; onClick?: () => void }) {
  return <button type="button" aria-label={label} onClick={onClick} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50"><Icon size={18}/></button>;
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>;
}

export default function UntitledRTLShowcase() {
  const [active, setActive] = useState('نمای کلی');
  const [tab, setTab] = useState('همه');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [channels, setChannels] = useState([true, true, false]);
  const filtered = rows.filter(row => (tab === 'همه' || row.status === tab) && `${row.title} ${row.owner} ${row.kind}`.includes(query.trim()));

  return <div dir="rtl" className="min-h-screen bg-[#f9fafb] text-[#101828] antialiased">
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <IconButton icon={Menu} label="نمایش منو" onClick={() => setMobileNav(v => !v)}/>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white"><Command size={20}/></div>
        <div><p className="text-sm font-semibold">تدبیر جامع</p><p className="text-xs text-slate-500">فضای کاری ممتد</p></div>
      </div>
      <div className="hidden w-full max-w-md px-6 md:block"><label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-400 shadow-sm focus-within:border-indigo-500"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="جست‌وجو" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"/><kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px]">⌘ K</kbd></label></div>
      <div className="flex items-center gap-3"><IconButton icon={CircleHelp} label="راهنما"/><IconButton icon={Bell} label="اعلان‌ها"/><div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">ع‌م</div></div>
    </header>
    <div className="mx-auto flex max-w-[1600px]">
      <aside className={`${mobileNav ? 'flex' : 'hidden'} fixed inset-y-[72px] right-0 z-20 w-64 flex-col border-l border-slate-200 bg-white p-4 lg:sticky lg:top-[72px] lg:flex lg:h-[calc(100vh-72px)] lg:shrink-0`}>
        <div className="mb-6 px-2 py-3"><p className="text-xs font-semibold text-slate-500">فضای کاری</p><button type="button" className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white p-3 text-sm font-semibold shadow-sm"><span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-100 text-indigo-700">م</span>ممتد</span><ChevronDown size={16}/></button></div>
        <p className="mb-2 px-3 text-xs font-semibold text-slate-500">عمومی</p>
        <nav className="space-y-1">{nav.map(({label,icon:Icon}) => <button key={label} type="button" onClick={() => {setActive(label);setMobileNav(false)}} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${active===label?'bg-slate-100 text-slate-900':'text-slate-600 hover:bg-slate-50'}`}><Icon size={19}/>{label}{active===label&&<ChevronLeft className="me-auto" size={16}/>}</button>)}</nav>
        <div className="mt-auto space-y-1 border-t border-slate-200 pt-4"><button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Settings size={19}/>تنظیمات</button><div className="mt-3 flex items-center gap-3 rounded-lg p-2"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold">ع‌م</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">علی محمدی</p><p className="truncate text-xs text-slate-500">ali@example.com</p></div><ChevronDown size={16} className="text-slate-400"/></div></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="mb-3 flex items-center gap-2 text-sm text-slate-500"><span>فضای کاری</span><ChevronLeft size={14}/><span className="font-semibold text-slate-700">{active}</span></div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">نمای کلی</h1><p className="mt-2 text-sm text-slate-600">سلام علی، به فضای کاری خودت خوش آمدی.</p></div><div className="flex flex-wrap gap-3"><Button variant="secondary"><Download size={17}/>خروجی گرفتن</Button><Button variant="primary" onClick={() => setMenuOpen(v => !v)}><Plus size={17}/>ایجاد محتوا</Button>{menuOpen&&<div className="relative"><div className="absolute left-0 top-0 z-20 mt-12 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"><button type="button" onClick={() => setMenuOpen(false)} className="flex w-full rounded-md px-3 py-2 text-sm hover:bg-slate-50">محتوای متنی</button><button type="button" onClick={() => setMenuOpen(false)} className="flex w-full rounded-md px-3 py-2 text-sm hover:bg-slate-50">گزارش جدید</button></div></div>}</div></div>
          {notice&&<div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600"><Check size={20}/></span><div className="flex-1"><p className="text-sm font-semibold text-emerald-900">فضای کاری شما آماده است</p><p className="mt-1 text-sm text-emerald-800">می‌توانید محتوا ایجاد کنید، اعضا را مدیریت کنید و روند انتشار را پیگیری کنید.</p></div><IconButton icon={X} label="بستن پیام" onClick={() => setNotice(false)}/></div>}
          <div className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({label,value,detail,icon:Icon,positive})=><Card key={label} className="p-5"><div className="flex items-start justify-between"><p className="text-sm font-medium text-slate-600">{label}</p><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Icon size={19}/></span></div><p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500">{positive&&<ArrowUpRight size={14} className="text-emerald-600"/>}{detail}</p></Card>)}</div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
            <Card className="overflow-hidden"><div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><h2 className="text-base font-semibold">محتوای اخیر</h2><p className="mt-1 text-sm text-slate-500">مرور و پیگیری محتوای فضای کاری</p></div><Button variant="secondary"><Filter size={17}/>فیلتر</Button></div>
              <div className="flex flex-wrap gap-1 border-b border-slate-200 px-5">{['همه','منتشرشده','در حال بازبینی','پیش‌نویس'].map(t=><button key={t} type="button" onClick={() => setTab(t)} className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab===t?'border-indigo-600 text-indigo-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>{t}</button>)}</div>
              <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">عنوان</th><th className="px-4 py-3 font-medium">نوع</th><th className="px-4 py-3 font-medium">مسئول</th><th className="px-4 py-3 font-medium">تاریخ</th><th className="px-5 py-3 font-medium">وضعیت</th></tr></thead><tbody>{filtered.length?filtered.map(row=><tr key={row.title} className="border-t border-slate-200"><td className="px-5 py-4 font-semibold text-slate-800">{row.title}</td><td className="px-4 py-4 text-slate-600">{row.kind}</td><td className="px-4 py-4 text-slate-600">{row.owner}</td><td className="whitespace-nowrap px-4 py-4 text-slate-500">{row.date}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.tone==='success'?'bg-emerald-50 text-emerald-700':row.tone==='warning'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-700'}`}>{row.status}</span></td></tr>):<tr><td colSpan={5} className="p-8 text-center text-sm text-slate-500">موردی پیدا نشد.</td></tr>}</tbody></table></div>
              <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3"><p className="text-sm text-slate-500">نمایش {filtered.length} از ۱۲۸ مورد</p><div className="flex gap-2"><Button variant="secondary" disabled><ChevronRight size={16}/>قبلی</Button><Button variant="secondary">بعدی<ChevronLeft size={16}/></Button></div></div>
            </Card>
            <div className="space-y-6">
              <Card className="p-5"><div className="mb-5"><h2 className="text-base font-semibold">کانال‌های انتشار</h2><p className="mt-1 text-sm text-slate-500">وضعیت اتصال به مقصدها</p></div><div className="space-y-5">{['وب‌سایت','خبرنامه','شبکه‌های اجتماعی'].map((name,index)=><div key={name} className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">{name[0]}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-xs text-slate-500">{index===0?'متصل به سامانه':index===1?'ارسال هفتگی':'غیرفعال'}</p></div><button type="button" role="switch" aria-checked={channels[index]} aria-label={`تغییر وضعیت ${name}`} onClick={() => setChannels(current=>current.map((v,i)=>i===index?!v:v))} className={`relative h-6 w-11 rounded-full p-0.5 ${channels[index]?'bg-indigo-600':'bg-slate-200'}`}><span className={`block h-5 w-5 rounded-full bg-white shadow-sm ${channels[index]?'translate-x-0':'-translate-x-5'}`}/></button></div>)}</div></Card>
              <Card className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">فعالیت اخیر</h2><button type="button" className="text-sm font-semibold text-indigo-700">مشاهده همه</button></div><div className="space-y-5"><div className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500"/><div><p className="text-sm text-slate-700"><strong className="font-semibold">سارا احمدی</strong> یک محتوا منتشر کرد.</p><p className="mt-1 text-xs text-slate-500">۱۰ دقیقه پیش</p></div></div><div className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500"/><div><p className="text-sm text-slate-700"><strong className="font-semibold">علی رضایی</strong> یک مورد را برای بازبینی فرستاد.</p><p className="mt-1 text-xs text-slate-500">۳۵ دقیقه پیش</p></div></div><div className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-500"/><div><p className="text-sm text-slate-700"><strong className="font-semibold">مریم کریمی</strong> یک پیش‌نویس را به‌روزرسانی کرد.</p><p className="mt-1 text-xs text-slate-500">۱ ساعت پیش</p></div></div></div></Card>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">پیش‌نمایش مستقل رابط کاربری · داده‌ها آزمایشی هستند</p>
        </div>
      </main>
    </div>
  </div>;
}
