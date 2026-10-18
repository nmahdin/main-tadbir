import React from 'react';
import { UiShowcasePage } from './UiShowcasePage';
import './uiShowcaseThemes.css';

/** Public, read-only demo using the actual Tadbir design-system components. */
export function UiShowcaseThemeComparison() {
  React.useEffect(() => {
    document.body.dataset.tadbirThemePreview = 'ocean';
    return () => { delete document.body.dataset.tadbirThemePreview; };
  }, []);
  return <div dir="rtl" className="tadbir-theme-lab">
    <header className="tadbir-theme-lab__header">
      <div>
        <h1>قالب رنگی تدبیر</h1>
        <p>یک هویت بصری روشن، منظم و آرام با رنگ اصلی #39677C — پیش‌نمایش روی اجزای واقعی سامانه</p>
      </div>
      {import.meta.env.DEV && <a href="/_dev/ui-showcase">نمایشگاه اصلی ↗</a>}
    </header>
    <div className="tadbir-theme-lab__palette" aria-label="پالت اصلی تدبیر">
      {[
        ['#39677C','اصلی'],['#2B5266','هاور'],['#7296A8','آبی مکمل'],
        ['#DCEAF0','سطوح لطیف'],['#F5F9FA','پس‌زمینه'],['#FFFFFF','کارت‌ها'],
        ['#E2E9EC','حاشیه'],['#243944','متن'],['#EFC377','آفتابی']
      ].map(([color,label])=><div className="tadbir-theme-lab__color" key={color}>
        <span style={{backgroundColor:color}}/>
        <b>{label}</b><code>{color}</code>
      </div>)}
    </div>
    <p className="tadbir-theme-lab__selected">قالب واحد تدبیر — رنگ‌بندی‌های قبلی حذف شده‌اند؛ اطلاعات این صفحه نمایشی هستند.</p>
    <div className="tadbir-theme-lab__surface"><UiShowcasePage /></div>
  </div>;
}
