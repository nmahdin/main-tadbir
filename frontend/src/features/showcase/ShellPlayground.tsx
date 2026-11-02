import React, { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, FolderKanban, LayoutDashboard, ListTodo, Menu, PanelRightClose, PanelRightOpen, Settings, ShieldCheck, UserRound, X, type LucideIcon } from 'lucide-react';
import { ORGANIZATION_NAV, PLATFORM_NAV } from '../../app/shell/navigation';
import './shellPlayground.css';

type Env = 'workspace' | 'organization' | 'platform';
type Width = 1440 | 834 | 390;
type Item = { key: string; title: string; icon: LucideIcon; disabled?: boolean };
type Section = { key: string; title: string; items: Item[] };
const workspace: Section[] = [
  { key: 'daily', title: 'کار روزانه', items: [
    { key: 'dashboard', title: 'کارتابل من', icon: LayoutDashboard },
    { key: 'tasks', title: 'وظیفه‌های من', icon: ListTodo },
  ] },
  { key: 'projects-group', title: 'برنامه‌ریزی و اجرا', items: [
    { key: 'projects', title: 'پروژه‌ها و برنامه‌ریزی', icon: FolderKanban },
    { key: 'settings', title: 'تنظیمات فضای کاری', icon: Settings },
    { key: 'disabled', title: 'قابلیت آزمایشی غیرفعال', icon: ShieldCheck, disabled: true },
  ] },
];
const environments: { value: Env; label: string; role: string }[] = [
  { value: 'workspace', label: 'فضای کاری شخصی', role: 'عضو تیم (نمایشی)' },
  { value: 'organization', label: 'مدیریت سازمان', role: 'مدیر سازمان (نمایشی)' },
  { value: 'platform', label: 'مدیریت پلتفرم', role: 'مدیر پلتفرم (نمایشی)' },
];
const sectionsFor = (env: Env): Section[] => env === 'workspace' ? workspace : [{
  key: 'management', title: env === 'organization' ? 'مدیریت سازمان' : 'مدیریت پلتفرم',
  items: (env === 'organization' ? ORGANIZATION_NAV : PLATFORM_NAV).map(x => ({ key: x.key, title: x.title, icon: x.icon })),
}];

export function ShellPlayground() {
  const [width, setWidth] = useState<Width>(1440);
  const [environment, setEnvironment] = useState<Env>('workspace');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [groups, setGroups] = useState<string[]>(['daily', 'projects-group', 'management']);
  const [selected, setSelected] = useState('dashboard');
  const [notifs, setNotifs] = useState(false);
  const [profile, setProfile] = useState(false);
  const [read, setRead] = useState(false);
  const [feedback, setFeedback] = useState('همهٔ اطلاعات و تعامل‌های این بخش آزمایشی هستند.');
  const opener = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const sections = sectionsFor(environment);
  const items = sections.flatMap(x => x.items);
  const current = items.find(x => x.key === selected) ?? items[0];
  const mobile = width === 390;
  const narrow = width === 834;
  const compact = narrow || (!mobile && collapsed);
  function closeDrawer() { setDrawerOpen(false); }
  function chooseEnvironment(next: Env) {
    setEnvironment(next);
    setSelected(sectionsFor(next)[0].items[0].key);
    setGroups(['daily','projects-group','management']);
    closeDrawer(); setNotifs(false); setProfile(false);
    setFeedback('محیط فقط در پیش‌نمایش تغییر کرد.');
  }
  useEffect(() => {
    if (drawerOpen && mobile) drawer.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = drawerOpen && mobile;
  }, [drawerOpen, mobile]);
  useEffect(() => {
    if (!drawerOpen || !mobile) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(drawer.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []).filter(el => el.getClientRects().length);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [drawerOpen, mobile]);
  useEffect(() => {
    if (!notifs && !profile) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setNotifs(false); setProfile(false); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [notifs, profile]);
  const sidebar = (isDrawer: boolean) => (
    <aside ref={isDrawer ? drawer : undefined} aria-label="منوی آزمایشی تدبیر" className={'tsp-sidebar' + (isDrawer ? ' tsp-drawer' : '')} data-collapsed={!isDrawer && compact}>
      <div className="tsp-brand">
        <span className="tsp-logo"><LayoutDashboard size={19}/></span>
        {(!compact || isDrawer) && <strong>سامانه تدبیر</strong>}
        {isDrawer ? <button aria-label="بستن منوی موبایل" onClick={closeDrawer}><X size={18}/></button> : !narrow && <button aria-label={collapsed ? 'بازکردن سایدبار' : 'جمع‌کردن سایدبار'} title={collapsed ? 'بازکردن سایدبار' : 'جمع‌کردن سایدبار'} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? <PanelRightOpen size={18}/> : <PanelRightClose size={18}/>}</button>}
      </div>
      <div className="tsp-env" title={environments.find(x => x.value === environment)?.label}>
        <LayoutDashboard size={17}/>
        {(!compact || isDrawer) && <span>{environments.find(x => x.value === environment)?.label}<small>محیط نمایشی</small></span>}
      </div>
      <nav aria-label="فهرست صفحات نمونه" className="tsp-nav">
        {sections.map(section => <div key={section.key}>
          {(!compact || isDrawer) && <button className="tsp-group" aria-expanded={groups.includes(section.key)} onClick={() => setGroups(g => g.includes(section.key) ? g.filter(k => k !== section.key) : [...g,section.key])}>
            <span>{section.title}</span><ChevronDown size={15}/>
          </button>}
          {(compact && !isDrawer || groups.includes(section.key)) && section.items.map(item => {
            const Icon = item.icon;
            return <button key={item.key} disabled={item.disabled} title={item.title} aria-label={item.title} aria-current={current?.key === item.key ? 'page' : undefined}
              className="tsp-item" onClick={() => { setSelected(item.key); setFeedback('صفحهٔ نمونه انتخاب شد؛ هیچ ناوبری واقعی انجام نشد.'); if(isDrawer) closeDrawer(); }}>
              <Icon size={18}/>{(!compact || isDrawer) && <span>{item.title}</span>}
            </button>;
          })}
        </div>)}
      </nav>
      <div className="tsp-dock"><span className="tsp-avatar"><UserRound size={18}/></span>{(!compact || isDrawer) && <span>کاربر آزمایشی<small>پروفایل نمایشی</small></span>}</div>
    </aside>
  );
  return <section className="tsp-playground" dir="rtl" aria-label="پیش‌نمایش تعاملی سایدبار و کارت‌ها">
    <div className="tsp-controls">
      <div><h2>پیش‌نمایش پوستهٔ سامانه</h2><p>سایدبار، هدر و کارت‌های گرد Ocean — فقط برای نمایش</p></div>
      <label>محیط نمونه <select aria-label="محیط پیش‌نمایش" value={environment} onChange={e => chooseEnvironment(e.target.value as Env)}>
        {environments.map(x => <option value={x.value} key={x.value}>{x.label}</option>)}
      </select></label>
      <div role="group" aria-label="عرض نمونه">
        {([1440,834,390] as Width[]).map(n => <button key={n} aria-pressed={width === n} onClick={() => { setWidth(n); closeDrawer(); }}>{n}px</button>)}
      </div>
    </div>
    <div className="tsp-scroller"><div className="tsp-frame" style={{ width }} data-width={width}>
      <div className="tsp-shell">
        {!mobile && sidebar(false)}
        <div className="tsp-main">
          <header className="tsp-header">
            <div className="tsp-head-title">
              {mobile && <button ref={opener} aria-label="باز کردن سایدبار آزمایشی" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Menu size={20}/></button>}
              <span><strong>{current?.title}</strong><small>{environments.find(x => x.value === environment)?.label}</small></span>
            </div>
            <div className="tsp-actions">
              {!mobile && <button className="tsp-action" onClick={() => setFeedback('این اقدام فقط نمایشی است.')}>اقدام نمونه</button>}
              <div className="tsp-popup-parent"><button aria-label="اعلان‌های آزمایشی" aria-expanded={notifs} onClick={() => { setNotifs(v => !v); setProfile(false); }}><Bell size={19}/>{!read && <i/>}</button>
                {notifs && <div className="tsp-popup"><strong>اعلان‌های نمونه</strong><p>یک پروژهٔ نمایشی به‌روزرسانی شد.</p><button onClick={() => { setRead(true); setNotifs(false); }}>علامت‌گذاری خوانده‌شده</button></div>}
              </div>
              <div className="tsp-popup-parent"><button aria-label="پروفایل آزمایشی" aria-expanded={profile} onClick={() => { setProfile(v => !v); setNotifs(false); }}><UserRound size={20}/></button>
                {profile && <div className="tsp-popup"><strong>کاربر آزمایشی</strong><p>نقش: {environments.find(x => x.value === environment)?.role}</p><button onClick={() => { setProfile(false); setFeedback('عملیات پروفایل صرفاً نمایشی است.'); }}>مشاهدهٔ نمونه</button></div>}
              </div>
            </div>
          </header>
          <main className="tsp-content">
            <p className="tsp-intro">نمونهٔ طراحی صفحه با کارت‌های تاییدشده در Amendment C</p>
            <div className="tsp-kpis"><article><small>پروژه‌های فعال</small><strong>۱۲</strong><span>نمونهٔ کارت مستقل، شعاع ۲۰px</span></article><article><small>وظیفه‌های جاری</small><strong>۲۸</strong><span>سایهٔ بسیار ملایم</span></article></div>
            <section className="tsp-primary"><h3>محدودهٔ اصلی محتوا — ۲۴px</h3><p>پس‌زمینهٔ سفید، حاشیه و سایهٔ ظریف</p><div className="tsp-nested"><strong>پنل داخلی — ۱۶px</strong><span>بدون سایهٔ اضافی</span></div><label>کنترل نمونه — ۱۲px<input placeholder="جست‌وجوی نمونه" aria-label="جست‌وجوی نمونه"/></label></section>
            <p className="tsp-feedback" role="status">{feedback}</p>
          </main>
        </div>
        {mobile && drawerOpen && <><button className="tsp-backdrop" aria-label="بستن با لمس پس‌زمینه" onClick={closeDrawer}/>{sidebar(true)}</>}
      </div>
    </div></div>
  </section>;
}
