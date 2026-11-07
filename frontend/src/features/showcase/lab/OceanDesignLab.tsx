import React from 'react';
import { OceanShellPlayground } from './OceanShellPlayground';
import { GuidedTourPrototype } from './GuidedTourPrototype';
import './tour.css';
import './oceanLab.css';
/** Prototypes live only beneath the public design-gallery route. */
export function OceanDesignLab(){
 const lab=new URLSearchParams(window.location.search).get('lab')==='tour' ? 'tour':'shell';
 return <section className="odl" dir="rtl" aria-label="آزمایشگاه تعاملی Ocean">
  <div className="odl-intro"><div><small>OCEAN / INTERACTION LAB</small><h2>آزمایشگاه تجربهٔ تدبیر</h2>
   <p>پیش‌نمایش تعاملی و مستقل از داده‌ها و دسترسی‌های واقعی سامانه.</p></div><span>فقط آزمایشی</span></div>
  <nav aria-label="بخش‌های آزمایشگاه" className="odl-lab-nav">
   <a aria-current={lab==='shell'?'page':undefined} href="/theme-previews?lab=shell">پوستهٔ Ocean</a>
   <a aria-current={lab==='tour'?'page':undefined} href="/theme-previews?lab=tour">تور معرفی محصول</a>
  </nav>
  {lab==='tour'?<GuidedTourPrototype/>:<OceanShellPlayground />}
 </section>;
}
