import React,{useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {ArrowLeft,ChevronDown,ChevronLeft,Command,ExternalLink,Home,Menu,PanelRightClose,PanelRightOpen,Search,X} from 'lucide-react';
import {STUDIO_GROUPS,STUDIO_PAGES,resolveStudioPage,studioGroupFor,studioPath,studioToggleGroup,type StudioPage} from './studioRoutes';
import {StudioDemoPage,StudioOverview} from './StudioDemoPages';
import {OceanShellPlayground} from '../lab/OceanShellPlayground';
import {GuidedTourPrototype} from '../lab/GuidedTourPrototype';
import {LayoutEditorPrototype} from '../lab/LayoutEditorPrototype';
import '../lab/oceanLab.css';
import '../lab/tour.css';
import '../lab/layout.css';
import './studio.css';
import './studioPages.css';

export function OceanStudioLayout({gallery}:{gallery:React.ReactNode}){
 const location=useLocation();
 const page=resolveStudioPage(location.pathname);
 const group=studioGroupFor(page);
 const [collapsed,setCollapsed]=useState(false);
 const [mobile,setMobile]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 767px)').matches);
 const [drawerOpen,setDrawerOpen]=useState(false);
 const [openedGroups,setOpenedGroups]=useState<string[]>(()=>STUDIO_GROUPS.map(x=>x.id));
 const [search,setSearch]=useState('');
 const sidebar=useRef<HTMLElement>(null),opener=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const routeBefore=useRef(location.pathname),drawerBefore=useRef(false);
 const skipDrawerFocusRestore=useRef(false);
 useEffect(()=>{
  const media=window.matchMedia('(max-width: 767px)');
  const change=()=>setMobile(media.matches);
  change();media.addEventListener('change',change);
  return()=>media.removeEventListener('change',change);
 },[]);
 useEffect(()=>{
  if(sidebar.current) sidebar.current.inert=mobile&&!drawerOpen;
 },[mobile,drawerOpen]);
 useEffect(()=>{
  if(location.pathname!==routeBefore.current){
   // Navigation focuses the next heading, not the opener of the departing drawer.
   skipDrawerFocusRestore.current=true;
   setDrawerOpen(false);
   heading.current?.focus();
   routeBefore.current=location.pathname;
  }
 },[location.pathname]);
 useEffect(()=>{
  if(mobile&&drawerOpen&&!skipDrawerFocusRestore.current) sidebar.current?.querySelector<HTMLElement>('[data-studio-drawer-close]')?.focus();
  else if(drawerBefore.current&&!skipDrawerFocusRestore.current) opener.current?.focus();
  drawerBefore.current=mobile&&drawerOpen;
  if(!drawerOpen) skipDrawerFocusRestore.current=false;
 },[mobile,drawerOpen,location.pathname]);
 useEffect(()=>{
  if(!drawerOpen||!mobile)return;
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setDrawerOpen(false);return;}
   if(event.key!=='Tab')return;
   const focus=(Array.from(sidebar.current?.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled)')??[]) as HTMLElement[])
     .filter(element=>element.getClientRects().length);
   if(!focus.length)return;
   const first=focus[0],last=focus[focus.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[drawerOpen,mobile]);
 const filtering=search.trim().length>0;
 const visibleGroups=STUDIO_GROUPS.map(g=>({...g,items:g.items.filter(x=>(x.title+' '+x.description).includes(search.trim()))})).filter(g=>g.items.length>0);
 const sidebarCompact=collapsed&&!mobile;
 const title=page?.title??'این صفحه پیدا نشد';
 // Render content as a node, not a nested component: collapsing or searching
 // the sidebar must not remount a form and discard its unsaved demo values.
 const renderPage=()=>{
  if(!page)return <div className="ods-notfound"><h2>صفحهٔ مورد نظر در استودیو یافت نشد.</h2>
   <Link to={studioPath('')}>بازگشت به نمای کلی</Link></div>;
  if(page.id==='overview')return <StudioOverview/>;
  if(page.id==='gallery')return <div className="ods-gallery">{gallery}</div>;
  if(page.id==='shell')return <div className="ods-prototype"><OceanShellPlayground/></div>;
  if(page.id==='tour')return <div className="ods-prototype"><GuidedTourPrototype/></div>;
  if(page.id==='layout')return <div className="ods-prototype"><LayoutEditorPrototype/></div>;
  return <StudioDemoPage pageId={page.id}/>;
 };
 return <div className="ods-studio" dir="rtl" data-testid="ocean-studio-shell" data-collapsed={sidebarCompact}>
  <a className="ods-skip" href="#ocean-studio-main">رفتن به محتوای اصلی</a>
  {mobile&&drawerOpen&&<button type="button" className="ods-backdrop" aria-label="بستن فهرست با لمس پس‌زمینه"
    tabIndex={-1} onClick={()=>setDrawerOpen(false)}/>}
  <aside ref={sidebar} className={'ods-sidebar '+(sidebarCompact?'ods-sidebar--compact ':'')+(mobile&&drawerOpen?'ods-sidebar--open':'')}
   role={mobile&&drawerOpen?'dialog':undefined} aria-modal={mobile&&drawerOpen?true:undefined} aria-label={mobile?'فهرست صفحات استودیو':'نوار کناری استودیو'}>
   <div className="ods-sidebar-head">
    <Link to={studioPath('')} className="ods-brand" aria-label="خانهٔ Ocean Studio" title="Ocean Studio">
      <span className="ods-brand-mark"><LayersIcon/></span>
      {!sidebarCompact&&<span className="ods-brand-text"><strong>Ocean Studio</strong><small>سیستم طراحی تدبیر</small></span>}
    </Link>
    {mobile?<button data-studio-drawer-close className="ods-icon-button" type="button" aria-label="بستن فهرست" onClick={()=>setDrawerOpen(false)}><X size={19}/></button>:
     <button className="ods-icon-button" type="button" aria-label={collapsed?'باز کردن سایدبار':'جمع کردن سایدبار'}
      aria-expanded={!collapsed} onClick={()=>setCollapsed(x=>!x)}>{collapsed?<PanelRightOpen size={19}/>:<PanelRightClose size={19}/>}</button>}
   </div>
   {!sidebarCompact&&<div className="ods-side-search"><Search size={15} aria-hidden/>
     <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی اجزا…" aria-label="جست‌وجو در صفحات استودیو"/></div>}
   <nav className="ods-navigation" aria-label="صفحات استودیو">
    {visibleGroups.map(section=><section className="ods-menu-group" key={section.id}>
      {!sidebarCompact&&<button className="ods-menu-heading" type="button" aria-expanded={filtering||openedGroups.includes(section.id)}
        aria-controls={'ods-menu-'+section.id} disabled={filtering}
        title={filtering?'برای تغییر گروه‌بندی، ابتدا عبارت جست‌وجو را پاک کنید.':undefined}
        onClick={()=>setOpenedGroups(current=>studioToggleGroup(current,section.id))}>
        <span>{section.title}</span><ChevronDown size={15} className={filtering||openedGroups.includes(section.id)?'ods-chevron-open':''}/></button>}
      <div id={'ods-menu-'+section.id} className="ods-menu-links" hidden={!sidebarCompact&&!filtering&&!openedGroups.includes(section.id)}>
       {section.items.map(item=>{
        const Icon=item.icon,active=page?.id===item.id;
        return <Link className={'ods-menu-link '+(active?'ods-menu-link--active':'')} to={studioPath(item.slug)} key={item.id}
         aria-label={item.title} aria-current={active?'page':undefined} title={item.title} onClick={()=>{if(mobile)setDrawerOpen(false);}}>
          <Icon size={18} strokeWidth={1.75} aria-hidden/><span className="ods-link-label">{item.title}</span>{!sidebarCompact&&active&&<span className="ods-active-dot"/>}
         </Link>;
       })}
      </div>
     </section>)}
    {!visibleGroups.length&&<p className="ods-no-search">نتیجه‌ای پیدا نشد.</p>}
   </nav>
   <footer className="ods-sidebar-foot"><span className="ods-foot-mark"><Command size={17}/></span>
    {!sidebarCompact&&<span><strong>فقط برای طراحی</strong><small>بدون دادهٔ کاربری یا API</small></span>}</footer>
  </aside>
  <div className="ods-workspace">
   <header className="ods-topbar">
    <div className="ods-topbar-title">
     {mobile&&<button ref={opener} className="ods-icon-button" type="button" aria-label="بازکردن فهرست استودیو"
       aria-expanded={drawerOpen} onClick={()=>setDrawerOpen(true)}><Menu size={21}/></button>}
     <nav className="ods-breadcrumb" aria-label="مسیر صفحه">
      <Link to={studioPath('')} aria-label="خانهٔ استودیو"><Home size={16}/></Link>
      <ChevronLeft size={13} aria-hidden/>
      {group&&page?.id!=='overview'&&<><span>{group.title}</span><ChevronLeft size={13} aria-hidden/></>}
      <span aria-current="page">{title}</span>
     </nav>
    </div>
    <div className="ods-topbar-actions">
     <span className="ods-status-label">DESIGN PREVIEW</span>
     <Link to={studioPath('research/coverage')} className="ods-help-link" aria-label="پژوهش و پوشش کامپوننت‌ها"><BookHelpIcon/><span>راهنمای پوشش</span></Link>
    </div>
   </header>
   <main id="ocean-studio-main" className="ods-main" tabIndex={-1}>
    <div className="ods-main-inner">
     <div className="ods-page-heading"><div><span className="ods-eyebrow">OCEAN / DESIGN SYSTEM STUDIO</span>
      <h1 ref={heading} tabIndex={-1} id="ods-content-title">{title}</h1><p>{page?.description??'این آدرس بخشی از استودیو نیست.'}</p></div>
      {page&&<span className="ods-page-number">{(STUDIO_PAGES.findIndex(p=>p.id===page.id)+1).toLocaleString('fa-IR')} / {STUDIO_PAGES.length.toLocaleString('fa-IR')}</span>}
     </div>
     {renderPage()}
    </div>
   </main>
  </div>
 </div>;
}
function LayersIcon(){return <span className="ods-ocean-glyph">◉</span>;}
function BookHelpIcon(){return <ExternalLink size={16} aria-hidden/>;}
