import React, { useState } from 'react';
import { UiShowcasePage } from './UiShowcasePage';
import './uiShowcaseThemes.css';

type ThemeKey = 'forest' | 'mint' | 'sun' | 'sky' | 'sage' | 'coast' | 'peach';
const options: { key: ThemeKey; name: string; detail: string; swatches: string[] }[] = [
  { key: 'forest', name: 'جنگل آفتابی روشن', detail: 'سبز برگ تازه، کرم روشن و زرد طلایی', swatches: ['#267554', '#E8F7EF', '#F4C451'] },
  { key: 'mint', name: 'نعنایی صبحگاهی', detail: 'فیروزه‌ای لطیف، سفید نعنایی و زرد روشن', swatches: ['#08796D', '#E3F9F4', '#FFCF75'] },
  { key: 'sun', name: 'آفتابی طبیعی', detail: 'قهوه‌ای ملایم، سبز آرام و کرم آفتابی', swatches: ['#92775B', '#A5B79C', '#F9F5E9', '#E5D4AA'] },
  { key: 'sky', name: 'آسمان بهاری', detail: 'آبی آرام، آبی یخی و خورشیدی', swatches: ['#2E6F9D', '#E5F4FF', '#F5C65C'] },
  { key: 'sage', name: 'مریم‌گلی و کتان', detail: 'کرم روشن، سبز مریم‌گلی، بژ و خاکستری', swatches: ['#FAF9EE', '#A2AF9B', '#DCCFC0', '#EEEEEE'] },
  { key: 'coast', name: 'ساحل مه‌آلود', detail: 'آبی پودری، کرم شنی و سفید گرم', swatches: ['#96B6C5', '#ADC4CE', '#EEE0C9', '#F1F0E8'] },
  { key: 'peach', name: 'باغ هلویی', detail: 'سبز گیاهی، نعنایی روشن، شیری و هلویی', swatches: ['#94B49F', '#CEE5D0', '#FCF8E8', '#ECB390'] },
];

/** Public read-only color lab using the real fictional-data DS showcase; root tokens remain untouched. */
export function UiShowcaseThemeComparison() {
  const [active, setActive] = useState<ThemeKey>('forest');
  const chosen = options.find(option => option.key === active)!;
  // The showcase is a public, isolated route. Portal-based dialogs render
  // under document.body rather than inside the preview surface, so mirror
  // the active palette on body while mounted and remove it on unmount.
  React.useEffect(() => {
    document.body.dataset.tadbirThemePreview = active;
    return () => { delete document.body.dataset.tadbirThemePreview; };
  }, [active]);
  return (
    <div dir="rtl" className="tadbir-theme-lab">
      <header className="tadbir-theme-lab__header">
        <div>
          <h1>آزمایش رنگ‌بندی روشن تدبیر</h1>
          <p>همان نمایشگاه اصلی DS-2.3 با هفت رنگ متفاوت؛ همهٔ تعامل‌ها صرفاً آزمایشی هستند.</p>
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
