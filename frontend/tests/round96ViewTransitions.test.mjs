import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('گذار صفحه فقط جایی فعال می‌شود که مرورگر و کاربر اجازه بدهند', async () => {
  const [helper, css] = await Promise.all([
    source('../src/utils/viewTransition.ts'),
    source('../src/index.css'),
  ]);

  // مرورگرهای بدون پشتیبانی و حالت «کاهش حرکت» ناوبری ساده می‌گیرند.
  assert.match(helper, /typeof \(document as TransitionDocument\)\.startViewTransition !== 'function'/);
  assert.match(helper, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  // ناوبری همیشه انجام می‌شود؛ در حالت بدون گذار، آماده‌سازی مقصد هم انجام و بعد
  // ناوبری ساده اجرا می‌شود (دور ۹۷).
  assert.match(helper, /if \(inFlight \|\| !viewTransitionsAvailable\(\)\) \{/);
  assert.match(helper, /if \(options\.prepare\) void options\.prepare\(\)\.catch\(\(\) => undefined\)\.finally\(update\);/);

  // React باید همان لحظه commit کند تا عکس دوم از محتوای تازه گرفته شود.
  assert.match(helper, /import \{ flushSync \} from 'react-dom';/);
  assert.match(helper, /transition = start\(\(\) => \{\s*\n\s*flushSync\(update\);/);

  // اگر مرورگر گذار را نپذیرد، ناوبری نباید گم شود.
  assert.match(helper, /catch \{[\s\S]{0,220}update\(\);\s*\n\s*return;/);
  // پرچم روی html در طول گذار ست و پس از پایان پاک می‌شود.
  assert.match(helper, /root\.setAttribute\(VIEW_TRANSITION_ATTRIBUTE, 'true'\);/);
  assert.match(helper, /void transition\.finished\.finally\(\(\) => \{/);

  // نام عنصر مورف‌شده معتبر و یکتا ساخته می‌شود.
  assert.match(helper, /export function morphName\(kind: 'content' \| 'project' \| 'task', id: string \| number\): string \{/);
  assert.match(helper, /return `tadbir-\$\{kind\}-\$\{String\(id \?\? ''\)\.replace\(\/\[\^a-zA-Z0-9_-\]\/g, '-'\)\}`;/);

  // انیمیشن‌ها: محو شدن نرم صفحه + زمان‌بندی کشیده‌تر برای عنصر مورف‌شده.
  assert.match(css, /::view-transition-old\(root\) \{ animation: ui-page-out \.16s ease-out both; \}/);
  assert.match(css, /::view-transition-new\(root\) \{ animation: ui-page-in \.26s cubic-bezier\(\.22, 1, \.36, 1\) both; \}/);
  assert.match(css, /::view-transition-group\(\*\) \{\s*\n\s*animation-duration: \.34s;/);
  // انیمیشن ورود صفحه در طول گذار «سریع» می‌شود، نه حذف (وگرنه دو بار محو می‌شد).
  assert.match(css, /html\[data-view-transition\] \.animate-in \{ animation-duration: 1ms !important; \}/);
  // کاهش حرکت، همهٔ گذارها را خاموش می‌کند.
  assert.match(css, /::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/);
});

test('عنوان کارت فهرست و سربرگ جزئیات نام مورف یکسان دارند', async () => {
  const [list, contentDetail, projectDetail] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/projects/ProjectDetailView.tsx'),
  ]);

  assert.match(list, /import \{ morphName, runViewTransition \} from '\.\.\/\.\.\/utils\/viewTransition';/);
  assert.match(list, /const rowMorphName = \(row: any\) => module === 'tasks' \? undefined : morphName\(module === 'contents' \? 'content' : 'project', row\.id\);/);
  assert.match(list, /<Link className=\{className\} to=\{detail\(row\.id\)\} style=\{\{ viewTransitionName: rowMorphName\(row\) \}\} onClick=\{morphOpen\(detail\(row\.id\)\)\}>/);

  // کلیک‌های ترکیبی و کلیک میانی به رفتار پیش‌فرض مرورگر واگذار می‌شوند.
  assert.match(list, /if \(event\.defaultPrevented \|\| event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey\) return;/);
  assert.match(list, /runViewTransition\(\(\) => navigate\(to\), \{ prepare \}\);/);
  // بستهٔ صفحهٔ مقصد پیش از شروع گذار آماده می‌شود (دور ۹۷).
  assert.match(list, /const prepare = module === 'contents' \? preloadContentDetail : preloadProjectDetail;/);

  // مقصد، همان نام را روی عنوان سربرگ می‌گذارد.
  assert.match(contentDetail, /<h1 style=\{\{ viewTransitionName: morphName\('content', content\.id\) \}\}/);
  assert.match(projectDetail, /<h1 style=\{\{ viewTransitionName: morphName\('project', project\.id\) \}\}/);

  // بازگشت هم انیمیشن دارد (مورف معکوس به ردیف فهرست).
  assert.match(contentDetail, /const back = \(to: number \| string\) => runViewTransition\(\(\) => \{/);
  assert.match(projectDetail, /onClick=\{\(\) => runViewTransition\(\(\) => \{ setSelectedProjectId\(null\); setActiveView\('projects'\); \}\)\}/);
});
