import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const primitives = readFileSync(new URL('../src/components/common/Primitives.tsx', import.meta.url), 'utf8');
const exitHook = readFileSync(new URL('../src/components/common/useModalExit.ts', import.meta.url), 'utf8');
const selectLayer = readFileSync(new URL('../src/components/common/CustomSelectLayer.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const minutes = readFileSync(new URL('../src/components/thought-room/MeetingMinutesModal.tsx', import.meta.url), 'utf8');
const ideaDetails = readFileSync(new URL('../src/components/thought-room/IdeaDetailsModal.tsx', import.meta.url), 'utf8');
const letterDetails = readFileSync(new URL('../src/components/secretariat/LetterDetailsModal.tsx', import.meta.url), 'utf8');

/**
 * دور ۵۶: برداشتن سایهٔ تب‌ها و سایدبار، انیمیشن ورود/خروج مدال‌ها و
 * انتخابگر سفارشی به‌جای فهرست پیش‌فرض مرورگر.
 */
test('only action buttons keep the subtle shadow', () => {
  const base = css.match(/button, \[role='button'\] \{([^}]*)\}/)?.[1] || '';
  assert.match(base, /box-shadow: none !important/);
  assert.doesNotMatch(base, /box-shadow: var\(/);
  const pressed = css.match(/button:active:not\(:disabled\), \[role='button'\]:active:not\(:disabled\) \{([^}]*)\}/)?.[1] || '';
  // نوبت ۶۸: در لحظهٔ فشار همهٔ دکمه‌ها سایهٔ درونیِ ریز می‌گیرند (حس فرورفتگی)،
  // ولی در حالت عادی هیچ دکمه‌ای جز دکمه‌های اقدام سایه ندارد.
  assert.match(pressed, /box-shadow: var\(--button-shadow-pressed\) !important/);
  // دکمه‌های اقدام فرم (ذخیره/انصراف/حذف/ایجاد) و دکمه‌های اصلی مدال سایه دارند
  const formAction = css.match(/\.ui-form-action \{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(formAction, /box-shadow/); // سایه از قاعدهٔ مشترک دکمه‌های اقدام می‌آید
  const actionRule = css.match(/\.ui-form-action,\s*\n\[data-button-action\],[\s\S]*?\{([^}]*)\}/)?.[1] || '';
  assert.match(actionRule, /box-shadow: var\(--button-shadow\) !important/);
  assert.match(css, /\[role='tab'\],\s*\n\[role='tablist'\] > button,\s*\naside button,\s*\n\[id\^='nav-item-'\],\s*\n\[data-button-flat\] \{\s*\n  box-shadow: none !important;/);
  // دکمهٔ «ثبت خروجی» هم از نشانهٔ صریح دکمهٔ اقدام استفاده می‌کند
  const detail = readFileSync(new URL('../src/components/content/ContentDetailView.tsx', import.meta.url), 'utf8');
  assert.match(detail, /data-button-action="save" type="submit"[^>]*className="ui-form-action ui-button ui-button-primary/);
});

test('the shared modal animates both in and out', () => {
  assert.match(primitives, /import \{ useModalExit \} from '\.\/useModalExit';/);
  assert.match(primitives, /const presence = useModalExit\(open, onClose\);/);
  assert.match(primitives, /data-state=\{state\} className=\{`ui-modal-overlay fixed inset-0/);
  assert.match(primitives, /ui-modal ui-modal-panel flex flex-col/);
  assert.match(exitHook, /export const MODAL_EXIT_MS = 170;/);
  assert.match(exitHook, /setClosing\(true\);\s*\n\s*timer\.current = window\.setTimeout/);
  assert.match(exitHook, /prefersReducedMotion\(\)\) \{ closeRef\.current\(\); return; \}/);
  // CSS انیمیشن‌ها
  assert.match(css, /@keyframes ui-panel-in/);
  assert.match(css, /@keyframes ui-panel-out/);
  assert.match(css, /\.ui-modal-overlay\[data-state='closing'\] \{ animation: ui-overlay-out/);
  assert.match(css, /\.ui-modal-panel\[data-state='closing'\] \{ animation: ui-panel-out/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,260}?\.ui-modal-overlay, \.ui-modal-panel/);
});

test('hand-rolled modals now animate on open and close too', () => {
  for (const file of [minutes, ideaDetails, letterDetails]) {
    assert.match(file, /import \{ useModalExit \} from '\.\.\/common\/useModalExit';/);
    assert.match(file, /const presence = useModalExit\(isOpen, onClose\);/);
    assert.match(file, /data-state=\{presence\.state\} className="ui-modal-overlay fixed inset-0/);
    assert.match(file, /data-state=\{presence\.state\} className="ui-modal-panel bg-white/);
    assert.doesNotMatch(file, /onClick=\{onClose\}/);
  }
  // کلاس‌های tailwindcss-animate که پیش‌تر بی‌اثر بودند اکنون تعریف شده‌اند.
  assert.match(css, /\.animate-in\.fade-in\.zoom-in-95 \{ animation-name: ui-panel-in; \}/);
});

test('a custom select layer replaces the browser-native dropdown for every select', () => {
  assert.match(app, /import \{ CustomSelectLayer \} from '\.\/components\/common\/CustomSelectLayer';/);
  assert.match(app, /<CustomSelectLayer \/>/);
  // فهرست بومی مرورگر بسته می‌شود و فهرست سفارشی جایش را می‌گیرد
  assert.match(selectLayer, /document\.addEventListener\('mousedown', onPointerDown, true\);/);
  assert.match(selectLayer, /event\.preventDefault\(\);\s*\n\s*select\.focus\(\{ preventScroll: true \}\);\s*\n\s*open\(select\);/);
  assert.match(selectLayer, /role="listbox"/);
  assert.match(selectLayer, /role="option"/);
  // انتخاب گزینه از مسیر بومی مقدار را می‌نویسد تا کنترل‌های کنترل‌شده هم به‌روز شوند
  assert.match(selectLayer, /Object\.getOwnPropertyDescriptor\(HTMLSelectElement\.prototype, 'value'\)\?\.set/);
  assert.match(selectLayer, /setter\.call\(select, value\);/);
  assert.match(selectLayer, /select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\);/);
  // استثناهای آگاهانه
  assert.match(selectLayer, /if \(select\.multiple \|\| select\.size > 1\) return false;/);
  assert.match(selectLayer, /if \(select\.hasAttribute\('data-native-select'\)\) return false;/);
  // ناوبری با کلید و بسته‌شدن با Escape
  assert.match(selectLayer, /if \(event\.key === 'Escape'\)/);
  assert.match(selectLayer, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
  // گروه‌بندی optgroup و گزینه‌های غیرفعال
  assert.match(selectLayer, /instanceof HTMLOptGroupElement/);
  assert.match(selectLayer, /disabled=\{item\.disabled\}/);
});
