import React,{useEffect,useRef,useState} from 'react';
import {Bell,ChevronDown,FolderKanban,LayoutDashboard,ListTodo,Menu,PanelRightClose,PanelRightOpen,Settings2,ShieldCheck,UserRound,X,type LucideIcon} from 'lucide-react';
import {ORGANIZATION_NAV,PLATFORM_NAV} from '../../../app/shell/navigation';
import {Card} from '../../../shared/ui/Primitives';
import {PrimaryContentContainer} from '../../../shared/ui/PrimaryContentContainer';
import {LAB_ENVS,LAB_WIDTHS,defaultCollapsed,mobileDrawer,toggleGroup,ensureActive,type LabDevice,type LabEnvironment} from './shellState';
type Item={key:string;title:string;icon:LucideIcon;disabled?:boolean};
type Section={key:string;title:string;items:Item[]};
const PERSONAL:Section[]=[
 {key:'daily',title:'کار روزانه',items:[{key:'home',title:'پیشخوان',icon:LayoutDashboard},{key:'tasks',title:'وظایف من',icon:ListTodo}]},
 {key:'planning',title:'برنامه‌ریزی و مدیریت',items:[{key:'projects',title:'پروژه‌ها و برنامه‌ریزی بلندمدت',icon:FolderKanban},{key:'settings',title:'تنظیمات فضای کاری',icon:Settings2},{key:'locked',title:'گزینهٔ غیرفعال آزمایشی',icon:ShieldCheck,disabled:true}]}
];
function menu(env:LabEnvironment):Section[]{
 if(env==='workspace')return PERSONAL;
 const nav=env==='organization'?ORGANIZATION_NAV:PLATFORM_NAV;
 return [{key:'management',title:env==='organization'?'مدیریت سازمان':'مدیریت پلتفرم',items:nav.map(x=>({key:x.key,title:x.title,icon:x.icon}))}];
}
export function OceanShellPlayground({initialEnv='workspace',initialWidth=1440}: {initialEnv?:LabEnvironment;initialWidth?:LabDevice}){
 const [env,setEnv]=useState<LabEnvironment>(initialEnv);
 const [width,setWidth]=useState<LabDevice>(initialWidth);
 const [collapsed,setCollapsed]=useState(defaultCollapsed(initialWidth));
 const [openGroups,setOpenGroups]=useState<string[]>(['daily','planning','management']);
 const [active,setActive]=useState('home');
 const [drawerOpen,setDrawerOpen]=useState(false);
 const [noticeOpen,setNoticeOpen]=useState(false);
 const [profileOpen,setProfileOpen]=useState(false);
 const [noticeRead,setNoticeRead]=useState(false);
 const [status,setStatus]=useState('همهٔ تغییرات در همین پیش‌نمایش باقی می‌مانند.');
 const drawer=useRef<HTMLElement>(null),opener=useRef<HTMLButtonElement>(null);
 const noticeButton=useRef<HTMLButtonElement>(null),profileButton=useRef<HTMLButtonElement>(null);
 const previousDrawer=useRef(false);
 const sections=menu(env),items=sections.flatMap(g=>g.items).filter(x=>!x.disabled);
 const selected=items.find(x=>x.key===active)??items[0];
 const mobile=mobileDrawer(width),label=LAB_ENVS.find(x=>x.value===env)!;
 const hidePanels=()=>{setNoticeOpen(false);setProfileOpen(false);};
 function chooseEnvironment(next:LabEnvironment){
   setEnv(next);setActive(ensureActive(menu(next).flatMap(g=>g.items).filter(x=>!x.disabled).map(x=>x.key)));
   setOpenGroups(['daily','planning','management']);setDrawerOpen(false);hidePanels();setStatus('محیط نمایشی تغییر کرد؛ هیچ مجوز واقعی تغییر نکرد.');
 }
 function chooseWidth(next:LabDevice){setWidth(next);setCollapsed(defaultCollapsed(next));setDrawerOpen(false);hidePanels();}
 useEffect(()=>{
  if(mobile&&drawerOpen)drawer.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  else if(previousDrawer.current)opener.current?.focus();
  previousDrawer.current=mobile&&drawerOpen;
 },[drawerOpen,mobile]);
 useEffect(()=>{
  if(!mobile||!drawerOpen)return;
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setDrawerOpen(false);return;}
   if(event.key!=='Tab')return;
   const focus=Array.from(drawer.current?.querySelectorAll('button:not(:disabled)')??[]) as HTMLButtonElement[];
   if(!focus.length)return;
   if(event.shiftKey&&document.activeElement===focus[0]){event.preventDefault();focus[focus.length-1].focus();}
   else if(!event.shiftKey&&document.activeElement===focus[focus.length-1]){event.preventDefault();focus[0].focus();}
  };
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 },[mobile,drawerOpen]);
 useEffect(()=>{
  if(!noticeOpen&&!profileOpen)return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){
   if(noticeOpen){setNoticeOpen(false);noticeButton.current?.focus();}
   if(profileOpen){setProfileOpen(false);profileButton.current?.focus();}
  }};
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 },[noticeOpen,profileOpen]);
 function aside(inDrawer:boolean){
  const compact=!inDrawer&&collapsed;
  return <aside ref={inDrawer?drawer:undefined} className={['odl-side',compact?'odl-side--compact':'',inDrawer?'odl-side--drawer':''].join(' ')}
   role={inDrawer?'dialog':undefined} aria-modal={inDrawer?true:undefined} aria-label={inDrawer?'کشوی نمایشی موبایل':'سایدبار نمایشی'}>
   <div className="odl-brand"><span className="odl-symbol"><LayoutDashboard size={19}/></span>
    {!compact&&<strong>تدبیر<small>OCEAN WORKSPACE</small></strong>}
    {inDrawer?<button aria-label="بستن کشوی موبایل" onClick={()=>setDrawerOpen(false)}><X size={18}/></button>:
     <button aria-label={collapsed?'بازکردن سایدبار':'جمع‌کردن سایدبار'} aria-expanded={!collapsed} onClick={()=>setCollapsed(x=>!x)}>{collapsed?<PanelRightOpen size={18}/>:<PanelRightClose size={18}/>}</button>}
   </div>
   <div data-tour-id="demo-environment" className="odl-side-env" title={label.label}><ShieldCheck size={18}/>
     {!compact&&<span>{label.label}<small>{label.role}</small></span>}</div>
   <nav className="odl-nav" aria-label="ناوبری آزمایشی" data-tour-id="demo-navigation">
    {sections.map(group=><div key={group.key}>
     {!compact&&<button className="odl-group" aria-expanded={openGroups.includes(group.key)} onClick={()=>setOpenGroups(current=>toggleGroup(current,group.key))}>
      {group.title}<ChevronDown size={16} className={openGroups.includes(group.key)?'odl-rotated':''}/></button>}
     {(compact||openGroups.includes(group.key))&&group.items.map(item=>{
      const Icon=item.icon;
      return <button key={item.key} className="odl-nav-item" title={item.title} aria-label={item.title} aria-current={item.key===selected?.key?'page':undefined}
       disabled={item.disabled} onClick={()=>{setActive(item.key);setStatus('فقط آیتم آزمایشی انتخاب شد؛ مسیری در برنامه باز نشد.');if(inDrawer)setDrawerOpen(false);}}>
       <Icon size={18}/>{!compact&&<span>{item.title}</span>}</button>;
     })}
    </div>)}
   </nav>
   <div className="odl-side-foot"><UserRound size={18}/>{!compact&&<span>کاربر نمونه<small>بدون نشست عملیاتی</small></span>}</div>
  </aside>;
 }
 return <section className="odl-shell" aria-label="پوستهٔ تعاملی Ocean" data-lab="shell">
  <div className="odl-controls">
   <label>محیط نمونه<select aria-label="محیط نمونه" value={env} onChange={e=>chooseEnvironment(e.target.value as LabEnvironment)}>
    {LAB_ENVS.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
   <div className="odl-width-controls" role="group" aria-label="عرض پیش‌نمایش">
    {LAB_WIDTHS.map(v=><button key={v} aria-pressed={width===v} onClick={()=>chooseWidth(v)}>{v}px</button>)}
   </div><span className="odl-fine-print">داده‌های ساختگی · بدون اتصال به API</span>
  </div>
  <div className="odl-frame-scroll"><div className="odl-frame" style={{width}} data-width={width}>
   <div className="odl-app">
    {!mobile&&aside(false)}
    <div className="odl-app-main">
     <header className="odl-app-header">
      <div className="odl-header-title">
       {mobile&&<button ref={opener} aria-label="بازکردن منوی موبایل" aria-expanded={drawerOpen} onClick={()=>setDrawerOpen(true)}><Menu size={20}/></button>}
       <div><strong>{selected?.title}</strong><small>{label.label}</small></div>
      </div>
      <div className="odl-header-actions">
       <button className="odl-context-action" onClick={()=>setStatus('اقدام نمایشی بدون ذخیره‌سازی اجرا شد.')}>اقدام نمونه</button>
       <div className="odl-anchor" data-tour-id="demo-notifications">
        <button ref={noticeButton} aria-label="اعلان‌های نمایشی" aria-expanded={noticeOpen} onClick={()=>{setNoticeOpen(x=>!x);setProfileOpen(false);}}>
         <Bell size={19}/>{!noticeRead&&<i className="odl-dot"/>}</button>
        {noticeOpen&&<div role="group" aria-label="منوی اعلان نمونه" className="odl-dropdown"><strong>اعلان‌های نمونه</strong><p>گزارش نمایشی برای مشاهده آماده شد.</p>
          <button onClick={()=>{setNoticeRead(true);setNoticeOpen(false);noticeButton.current?.focus();}}>علامت‌گذاری خوانده‌شده</button></div>}
       </div>
       <div className="odl-anchor" data-tour-id="demo-profile">
        <button ref={profileButton} aria-label="پروفایل نمایشی" aria-expanded={profileOpen} onClick={()=>{setProfileOpen(x=>!x);setNoticeOpen(false);}}><UserRound size={19}/></button>
        {profileOpen&&<div role="group" aria-label="منوی پروفایل نمونه" className="odl-dropdown"><strong>کاربر نمونه</strong><p>{label.role}</p>
          <button onClick={()=>{setProfileOpen(false);profileButton.current?.focus();}}>بستن منو</button></div>}
       </div>
      </div>
     </header>
     <main className="odl-content" data-tour-id="demo-dashboard">
      <div className="odl-content-heading"><div><small>OCEAN / DASHBOARD</small><h3>پیشخوان {label.label}</h3><p>نمونهٔ صفحه با طراحی مصوب و داده‌های فرضی.</p></div>
       <span className="odl-preview-tag">نمایشی</span></div>
      <div className="odl-kpis">
       <Card elevation="standalone"><div className="odl-kpi-data"><FolderKanban size={19} aria-hidden/><strong>۱۲</strong><span>پروژه‌های نمونه</span><small>کارت مستقل · ۲۰px</small></div></Card>
       <Card elevation="standalone"><div className="odl-kpi-data"><ListTodo size={19} aria-hidden/><strong>۲۸</strong><span>وظایف نمونه</span><small>سایهٔ بسیار ملایم</small></div></Card>
      </div>
      <PrimaryContentContainer elevation="soft" className="odl-primary">
       <h4>محدودهٔ اصلی محتوا</h4><p>گوشه‌های ۲۴ پیکسل و سایهٔ ظریف؛ بدون سایهٔ تو در تو.</p>
       <div className="odl-nested">پنل داخلی · ۱۶ پیکسل · بدون سایه</div>
       <label>کنترل نمونه<input aria-label="کنترل نمونه" placeholder="عنوان نمونه" /></label>
      </PrimaryContentContainer>
      <p role="status" className="odl-status">{status}</p>
     </main>
    </div>
    {mobile&&drawerOpen&&<><button className="odl-backdrop" tabIndex={-1} aria-label="بستن با کلیک پس‌زمینه" onClick={()=>setDrawerOpen(false)}/>{aside(true)}</>}
   </div>
  </div></div>
 </section>;
}
