import React from 'react';
import { OceanShellPlayground } from './OceanShellPlayground';
import './oceanLab.css';
/** Prototypes live only beneath the public design-gallery route. */
export function OceanDesignLab(){
 return <section className="odl" dir="rtl" aria-label="آزمایشگاه تعاملی Ocean">
  <div className="odl-intro"><div><small>OCEAN / INTERACTION LAB</small><h2>آزمایشگاه تجربهٔ تدبیر</h2>
   <p>پیش‌نمایش تعاملی و مستقل از داده‌ها و دسترسی‌های واقعی سامانه.</p></div><span>فقط آزمایشی</span></div>
  <OceanShellPlayground />
 </section>;
}
