import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, BookOpen, LayoutDashboard, Layers3, Sparkles} from 'lucide-react';
import {STUDIO_GROUPS,studioPath} from './studioRoutes';
export function StudioOverview(){
 return <div className="ods-overview">
   <section className="ods-welcome"><span className="ods-eyebrow">OCEAN DESIGN SYSTEM / 02</span>
    <h2>یک سیستم طراحی، تمام اجزای تدبیر</h2>
    <p>صفحات مستقل برای بررسی حالت‌های کامپوننت‌ها، زبان بصری و نمونه‌های تعاملی. داده‌ها و مجوزها در این بخش آزمایشی‌اند.</p>
    <div className="ods-hero-actions"><Link to={studioPath('components/buttons')}>مشاهدهٔ دکمه‌ها <ArrowLeft size={16}/></Link>
      <Link to={studioPath('foundations/radius')}>مقایسهٔ گردی سطوح</Link></div>
   </section>
   <div className="ods-overview-grid">{STUDIO_GROUPS.filter(x=>x.id!=='home').map(group=>
    <Link key={group.id} className="ods-overview-group" to={studioPath(group.items[0].slug)}>
      <span className="ods-group-icon"><group.items[0].icon size={20}/></span><strong>{group.title}</strong>
      <small>{group.items.length.toLocaleString('fa-IR')} صفحهٔ مستقل</small><ArrowLeft size={16}/></Link>)}</div>
 </div>;
}
export function StudioDemoPage({pageId}:{pageId:string}){
 return <div className="ods-placeholder" role="status"><Layers3 size={28} /><h2>در حال تکمیل نمونه‌های {pageId}</h2><p>مسیر این بخش آماده است؛ مثال‌های تعاملی در مرحلهٔ بعد اضافه می‌شوند.</p></div>;
}
