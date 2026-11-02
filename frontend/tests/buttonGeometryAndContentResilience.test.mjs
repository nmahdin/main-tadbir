import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeContent, normalizeContents, contentTextValue } from '../src/utils/contentNormalize.ts';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/ui-standards.md', import.meta.url), 'utf8');
const boundary = readFileSync(new URL('../src/components/common/Feedback.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/content/ContentDetailView.tsx', import.meta.url), 'utf8');
const stages = readFileSync(new URL('../src/components/content/StageAssetSections.tsx', import.meta.url), 'utf8');
const contentsApi = readFileSync(new URL('../src/api/contents.ts', import.meta.url), 'utf8');

/**
 * دور ۵۴: یکسان‌سازی ارتفاع دکمه‌ها (۳۶px)، سایهٔ بسیار جزئی و انیمیشن
 * فرورفتگی هنگام کلیک؛ به‌همراه رفع خطای رندر صفحهٔ محتوا برای پرونده‌های
 * دارای دادهٔ قدیمی/ناتمام.
 */
test('every button shares the 36px height token and only action buttons keep a subtle shadow', () => {
  assert.match(css, /--button-height:\s*2\.25rem/);
  const base = css.match(/button, \[role='button'\] \{([^}]*)\}/)?.[1] || '';
  assert.match(base, /min-height: var\(--button-height\)/);
  // پیش‌فرض: هیچ دکمه‌ای سایه ندارد (سربرگ فهرست‌ها، عنوان کارت‌ها، تب‌ها، سایدبار).
  assert.match(base, /box-shadow: none !important/);
  assert.doesNotMatch(base, /box-shadow: var\(/);
  // استثنا: دکمه‌های اقدام (ذخیره/انصراف/حذف/ایجاد) و دکمهٔ اصلی/خطر مدال‌ها.
  assert.match(css, /--button-shadow:\s*0 1px 2px 0 rgb\(15 23 42 \/ \.08\)/);
  const actionRule = css.match(/\.ui-form-action,\s*\n\[data-button-action\],[\s\S]*?\{([^}]*)\}/)?.[1] || '';
  assert.match(actionRule, /box-shadow: var\(--button-shadow\) !important/);
  assert.match(css, /\.ui-modal-panel \.ui-button-primary,\s*\n\.ui-modal-panel \.ui-button-danger \{/);
  // سازگاری همهٔ دکمه‌های استاندارد و آیکونی با همان توکن
  assert.match(css, /\.ui-button \{\s*min-height: var\(--button-height\)/);
  assert.match(css, /\.ui-icon-button \{[^}]*height: var\(--button-height\)/);
  assert.match(css, /\.rich-text-toolbar button \{[^}]*height: var\(--button-height\)/);
  assert.match(docs, /ارتفاع عمومی دکمه‌ها `--button-height` برابر ۳۶ پیکسل/);
});

test('pressing a button gives a pressed animation that honours reduced motion', () => {
  const pressed = css.match(/button:active:not\(:disabled\), \[role='button'\]:active:not\(:disabled\) \{([^}]*)\}/)?.[1] || '';
  assert.match(pressed, /transform: translateY\(1px\) scale\(\.995\) !important/);
  // دکمه‌های اقدام سایهٔ فشردهٔ درونی می‌گیرند، بقیه فقط جابه‌جا می‌شوند.
  assert.match(css, /--button-shadow-pressed:\s*inset 0 2px 3px 0 rgb\(15 23 42 \/ \.12\)/);
  const actionPressed = css.match(/\.ui-form-action:active:not\(:disabled\),[\s\S]*?\{([^}]*)\}/)?.[1] || '';
  assert.match(actionPressed, /box-shadow: var\(--button-shadow-pressed\) !important/);
  assert.match(css, /transition: color \.18s ease, background-color \.18s ease, border-color \.18s ease, transform \.1s ease/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?transform: none !important;[\s\S]*?\}/);
  // دکمهٔ غیرفعال سایه ندارد و جابه‌جا نمی‌شود.
  assert.match(css, /button:disabled, \[role='button'\]\[aria-disabled='true'\] \{\s*box-shadow: none !important;\s*transform: none !important;/);
});

test('legacy content payloads are normalised before rendering', () => {
  const broken = normalizeContent({
    id: '7',
    title: 'پروندهٔ قدیمی',
    status: 'producing',
    // ساختارهای ناقص همان‌طور که در payload قدیمی ذخیره شده‌اند
    stages: null,
    tags: 'خبری',
    attachments: [null, { id: 'a1', name: 'فایل', url: '' }],
    publishInfo: { caption: 'متن', channels: null },
  });
  assert.deepEqual(broken.stages, []);
  assert.deepEqual(broken.tags, []);
  assert.equal(broken.attachments?.length, 1);
  assert.deepEqual(broken.publishInfo?.channels, []);
  assert.equal(broken.title, 'پروندهٔ قدیمی');

  // مقدار عددی/بولینی خروجی به متن تبدیل می‌شود تا `.slice`/`.trim` نشکند.
  assert.equal(contentTextValue(42), '42');
  assert.equal(contentTextValue(true), 'بله');
  assert.equal(contentTextValue(null), undefined);
  assert.equal(contentTextValue({ value: 12 }), '12');

  const staged = normalizeContent({
    id: '8', title: 'فرایند', status: 'producing',
    stages: [
      null,
      { id: 's1', title: 'متن', status: 'in_progress', inputs: null, outputs: [{ id: 'o1', name: 'ستون عددی', value: 1234, rowIds: ['3', 'x'] }] },
    ],
  });
  assert.equal(staged.stages?.length, 1);
  assert.equal(staged.stages?.[0].outputs[0].value, '1234');
  assert.deepEqual(staged.stages?.[0].outputs[0].rowIds, ['3']);
  assert.deepEqual(normalizeContents(null), []);
});

test('the content API normalises every response so one bad file cannot crash the page', () => {
  assert.match(contentsApi, /const contentResponse = \(response: ApiResponse<Content>\): ApiResponse<Content> =>/);
  assert.match(contentsApi, /data: normalizeContents\(response\.data\)/);
  for (const method of ['get', 'create', 'update', 'restore', 'decide', 'forwardOutput']) {
    assert.match(contentsApi, new RegExp(`${method}[\\s\\S]{0,400}?\\.then\\(contentResponse\\)`), `${method} must normalise its response`);
  }
  assert.match(contentsApi, /publish[\s\S]{0,400}?\.then\(contentPairResponse\)/);
});

test('rendering never calls string methods on non-string output values', () => {
  assert.doesNotMatch(detail, /out\.value\.slice\(/);
  assert.match(detail, /String\(out\.value \?\? ''\) \? `· \$\{String\(out\.value\)\.slice\(0, 80\)\}` : ''/);
  assert.match(stages, /const raw = String\(view\.value \?\? view\.description \?\? ''\)\.trim\(\);/);
  assert.match(stages, /const escapeHtmlText = \(value: unknown\): string =>\s*String\(value \?\? ''\)\.replace/);
});

test('a broken tab cannot blank the whole content page', () => {
  assert.match(detail, /<ErrorBoundary resetKey=\{`\$\{content\.id\}:\$\{activeTab\}`\}>/);
  assert.match(detail, /import \{ ErrorBoundary \} from '\.\.\/common\/Feedback';/);
});

test('the error boundary retries on a new route and shows the technical message', () => {
  assert.match(boundary, /detail=\{runtime\.development\s*\? `\$\{this\.state\.error\.message\}\\n\\n\$\{this\.state\.error\.stack \|\| ''\}`\s*: this\.state\.error\.message\}/);
  assert.match(app, /<ErrorBoundary resetKey=\{`\$\{activeView\}:\$\{location\.pathname\}`\}>/);
});
