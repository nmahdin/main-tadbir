import React, { useState } from 'react';
import { UiShowcasePage } from './UiShowcasePage';
import './uiShowcaseThemes.css';

type ThemeKey = 'forest' | 'mint' | 'sun' | 'sky';
const options: { key: ThemeKey; name: string; detail: string; swatches: string[] }[] = [
  { key: 'forest', name: 'جنگل آفتابی روشن', detail: 'سبز برگ تازه، کرم روشن و زرد طلایی', swatches: ['#31876A', '#E8F7EF', '#F4C451'] },
  { key: 'mint', name: 'نعنایی صبحگاهی', detail: 'فیروزه‌ای لطیف، سفید نعنایی و زرد روشن', swatches: ['#119B91', '#E3F9F4', '#FFCF75'] },
  { key: 'sun', name: 'آفتابی ملایم', detail: 'طلایی، شیری و زرد آفتابی بدون قهوه‌ای', swatches: ['#AC791E', '#FFF7E2', '#F6CB67'] },
  { key: 'sky', name: 'آسمان بهاری', detail: 'آبی آرام، آبی یخی و خورشیدی', swatches: ['#438DBF', '#E5F4FF', '#F5C65C'] },
];

/** Development-only: reuse the exact real DS showcase. Styling is scoped and does not mutate global tokens. */
export function UiShowcaseThemeComparison() {
  const [active, setActive] = useState<ThemeKey>('forest');
  const chosen = options.find(option => option.key === active)!;
  return (
    <div dir="rtl" className="tadbir-theme-lab">
      <header className="tadbir-theme-lab__header">
        <div>
          <h1>آزمایش رنگ‌بندی روشن تدبیر</h1>
          <p>همان نمایشگاه اصلی DS-2.3 با چهار رنگ متفاوت؛ همهٔ تعامل‌ها صرفاً آزمایشی هستند.</p>
        </div>
        {import.meta.env.DEV && <a href="/_dev/ui-showcase">نمایشگاه اصلی بدون تغییر ↗</a>}
      </header>
      <div className="tadbir-theme-lab__choices" role="group" aria-label="انتخاب رنگ‌بندی">
        {options.map(option => (
          <button key={option.key} type="button" aria-pressed={active === option.key} onClick={() => setActive(option.key)}>
            <span className="tadbir-theme-lab__swatches">{option.swatches.map(c => <i key={c} style={{ backgroundColor: c }} />)}</span>
            <span><strong>{option.name}</strong><small>{option.detail}</small></span>
          </button>
        ))}
      </div>
      <p className="tadbir-theme-lab__selected">تم انتخابی: <strong>{chosen.name}</strong> — تغییر رنگ فقط داخل کادر آزمایش اعمال می‌شود.</p>
      <div className={`tadbir-theme-lab__surface tadbir-theme-lab--${active}`}>
        <UiShowcasePage />
      </div>
    </div>
  );
}
