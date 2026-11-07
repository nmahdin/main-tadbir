import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('فهرست محتواهای منتشرشده فیلتر «مجموعهٔ محتوا» دارد', async () => {
  const view = await source('../src/components/content/ContentPublishedView.tsx');

  assert.match(view, /const \[seriesFilter, setSeriesFilter\] = useState\('all'\)/);
  assert.match(view, /مجموعهٔ محتوا/);
  // گزینه‌ها از خودِ محتواهای منتشرشده ساخته می‌شوند تا مجموعهٔ بی‌پرونده نیاید.
  assert.match(view, /const seriesOptions = Array\.from\(new Map\(/);
  assert.match(view, /publishedContents\s*\n?\s*\.filter\(content => content\.seriesId\)/);
  assert.match(view, /content\.seriesName \|\| content\.seriesCode/);
  // «بدون مجموعه» هم قابل انتخاب است.
  assert.match(view, /<option value="none">بدون مجموعه<\/option>/);
  assert.match(view, /if \(seriesFilter === 'none' && content\.seriesId\) return false;/);
  assert.match(view, /String\(content\.seriesId \|\| ''\) !== seriesFilter/);
  // شمارشین فیلترهای فعال و پاک‌کردن آن‌ها هم شامل مجموعه می‌شود.
  assert.match(view, /seriesFilter !== 'all', Boolean\(dateFrom\)/);
  assert.match(view, /setSeriesFilter\('all'\);/);
});

test('نوار رنگی سربرگ جزئیات پروژه مثل سربرگ محتوا و هم‌رنگ رنگ اصلی است', async () => {
  const view = await source('../src/components/projects/ProjectDetailView.tsx');
  assert.match(view, /data-brand-band="primary"/);
  assert.match(view, /absolute inset-x-5 top-0 h-1 rounded-b-full bg-\[var\(--color-primary\)\]/);
  assert.doesNotMatch(view, /bg-gradient-to-l from-indigo-600 via-violet-500 to-purple-400/);
});

test('تب فعال رنگی هم سایهٔ ملایم دارد', async () => {
  const css = await source('../src/index.css');
  assert.match(css, /\[role='tab'\]\[aria-selected='true'\]\.bg-indigo-600/);
  assert.match(css, /box-shadow: 0 1px 2px rgb\(15 23 42 \/ \.18\), 0 2px 8px -3px rgb\(15 23 42 \/ \.32\) !important;/);
  // قاعدهٔ «تب‌های غیرفعال تخت» سر جایش است.
  assert.match(css, /\[role='tab'\],\s*\n\[role='tablist'\] > button,/);
});

test('نام محتوا یا پروژهٔ مرتبط زیر عنوان تسک از دادهٔ خود سرور می‌آید', async () => {
  const [view, types, resource, controller] = await Promise.all([
    source('../src/components/tasks/MyTasksView.tsx'),
    source('../src/types.ts'),
    source('../../backend/app/Http/Resources/TaskResource.php'),
    source('../../backend/app/Http/Controllers/Api/V1/TaskController.php'),
  ]);

  assert.match(view, /const contentLabel = task\.contentTitle \|\| linkedContent\?\.title \|\| '';/);
  assert.match(view, /const projectLabel = task\.projectTitle \|\| proj\?\.name \|\| '';/);
  assert.match(view, /\{relatedLabel && <span className="mt-0\.5 block truncate text-\[10px\] font-bold text-slate-500">\{relatedLabel\}<\/span>\}/);
  assert.match(view, /\{task\.contentTitle \|\| proj\?\.name\}/);

  assert.match(types, /contentTitle\?: string \| null;/);
  assert.match(types, /projectTitle\?: string \| null;/);
  assert.match(resource, /'contentTitle' => \$this->whenLoaded\('content'/);
  assert.match(resource, /'projectTitle' => \$this->whenLoaded\('project'/);
  assert.match(controller, /->with\(\['content:id,title', 'project:id,name'\]\)/);
});
