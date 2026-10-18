import React from 'react';
import { UiShowcasePage } from './UiShowcasePage';
import { Button } from '../../components/common/Primitives';
import { CheckCircle2, TriangleAlert, ShieldAlert } from 'lucide-react';
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
    <section className="tadbir-theme-lab__semantic-preview" aria-label="پیشنهاد دکمه‌های وضعیت">
      <div className="tadbir-theme-lab__semantic-heading">
        <h2>پیشنهاد دکمه‌های وضعیت — برای تأیید رنگ‌ها</h2>
        <p>پس‌زمینه سفید، حاشیه و نوشته رنگی؛ برای دیدن حالت هاور نشانگر ماوس را روی هر دکمه نگه دارید.</p>
      </div>
      <div className="tadbir-theme-lab__semantic-grid">
        <div className="tadbir-theme-lab__semantic-item">
          <Button className="tadbir-status-outline tadbir-status-outline--success"><CheckCircle2 size={17} aria-hidden />موفقیت</Button>
          <small>سبز ملایم · متن #34765B · هاور #EFF8F2</small>
        </div>
        <div className="tadbir-theme-lab__semantic-item">
          <Button className="tadbir-status-outline tadbir-status-outline--warning"><TriangleAlert size={17} aria-hidden />هشدار</Button>
          <small>کهربایی متعادل · متن #9A691F · هاور #FFF8EB</small>
        </div>
        <div className="tadbir-theme-lab__semantic-item">
          <Button className="tadbir-status-outline tadbir-status-outline--danger"><ShieldAlert size={17} aria-hidden />خطر</Button>
          <small>قرمز ملایم · متن #B64752 · هاور #FFF1F2</small>
        </div>
      </div>
    </section>
    <div className="tadbir-theme-lab__surface"><UiShowcasePage /></div>
  </div>;
}
