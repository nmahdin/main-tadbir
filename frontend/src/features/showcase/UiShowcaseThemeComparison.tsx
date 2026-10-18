import React from 'react';

const isHexColor = (value: string) => /^#?[0-9a-fA-F]{6}$/.test(value.trim());
const normalizeHex = (value: string) => `#${value.trim().replace(/^#/, '').toUpperCase()}`;
import { UiShowcasePage } from './UiShowcasePage';
import { Button } from '../../components/common/Primitives';
import { CheckCircle2, TriangleAlert, ShieldAlert } from 'lucide-react';
import './uiShowcaseThemes.css';

/** Public, read-only demo using the actual Tadbir design-system components. */
export function UiShowcaseThemeComparison() {
  const [colors, setColors] = React.useState({success:'#18771A', warning:'#D46D25', danger:'#BC2424'});
  const [drafts, setDrafts] = React.useState(colors);
  const semanticButtons = [
    {key:'success' as const, label:'موفقیت', Icon:CheckCircle2},
    {key:'warning' as const, label:'هشدار', Icon:TriangleAlert},
    {key:'danger' as const, label:'خطر', Icon:ShieldAlert},
  ];
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
        {semanticButtons.map(({key,label,Icon}) => {
          const color = colors[key];
          const valid = isHexColor(drafts[key]);
          return <div className="tadbir-theme-lab__semantic-item tadbir-theme-lab__editor" key={key}>
            <label htmlFor={`tadbir-status-hex-${key}`}>رنگ {label} (HEX)</label>
            <div className="tadbir-theme-lab__editor-input">
              <input id={`tadbir-status-hex-${key}`} dir="ltr" spellCheck={false}
                value={drafts[key]} maxLength={7} placeholder="#39677C"
                aria-invalid={!valid}
                onChange={e => {
                  const next = e.target.value;
                  setDrafts(prev => ({...prev,[key]:next}));
                  if (isHexColor(next)) setColors(prev => ({...prev,[key]:normalizeHex(next)}));
                }} />
              <input type="color" aria-label={`انتخاب رنگ ${label}`} value={color}
                onChange={e => {
                  const next = e.target.value.toUpperCase();
                  setDrafts(prev => ({...prev,[key]:next}));
                  setColors(prev => ({...prev,[key]:next}));
                }} />
            </div>
            {!valid && <small role="status">کد شش‌رقمی معتبر وارد کنید؛ رنگ قبلی حفظ می‌شود.</small>}
            <Button className="tadbir-status-outline tadbir-status-outline--custom"
              style={{ '--candidate':color, '--candidate-soft':`color-mix(in srgb, ${color} 9%, white)`, '--candidate-border':`color-mix(in srgb, ${color} 72%, white)` } as React.CSSProperties}>
              <Icon size={17} aria-hidden />{label}
            </Button>
            <small>رنگ انتخابی: {color} · هاور ۹٪ از همان رنگ</small>
          </div>;
        })}
      </div>
      <div className="tadbir-theme-lab__comparison">
        {([
          { title:'موفقیت — سبزهای پیشنهادی', name:'موفقیت', icon:'success', values:['#34765B','#778873','#607456'] },
          { title:'خطر — طیف نارنجی پیشنهادی', name:'خطر', icon:'danger', values:['#D98327','#FF9D50','#D46D25'] },
          { title:'خطر — طیف قرمز پیشنهادی', name:'خطر', icon:'danger', values:['#B64752','#A14646','#DA6556'] },
        ] as const).map(group => (
          <div className="tadbir-theme-lab__comparison-group" key={group.title}>
            <h3>{group.title}</h3>
            <div className="tadbir-theme-lab__comparison-options">
              {group.values.map(color => (
                <div className="tadbir-theme-lab__comparison-option" key={color}>
                  <Button className="tadbir-status-outline tadbir-status-outline--custom"
                    style={{ '--candidate':color, '--candidate-soft':`color-mix(in srgb, ${color} 9%, white)`, '--candidate-border':`color-mix(in srgb, ${color} 72%, white)` } as React.CSSProperties}>
                    {group.icon === 'success' ? <CheckCircle2 size={17} aria-hidden /> : <ShieldAlert size={17} aria-hidden />}
                    {group.name}
                  </Button>
                  <code>{color}</code>
                  <small>هاور: طیف ۹٪ همان رنگ</small>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
    <div className="tadbir-theme-lab__surface"><UiShowcasePage /></div>
  </div>;
}
