import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseListQuery } from '../src/routing/listQuery.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('فیلتر «محتوا» از صفحهٔ وظایف حذف شده و لینک‌های قدیمی هم بی‌اثرند', async () => {
  const view = await source('../src/components/workspace/WorkspaceList.tsx');

  // هیچ‌جای فهرست وظایف دیگر کادر انتخاب محتوا ندارد.
  assert.doesNotMatch(view, /aria-label="فیلتر محتوا"/);
  assert.doesNotMatch(view, /update\('content_id'/);
  assert.doesNotMatch(view, /app\.contents\.map\([^)]*content_id/s);

  // پارامتر `content_id` پیش از هر استفاده‌ای از فیلترها کنار گذاشته می‌شود.
  assert.match(view, /if \(module === 'tasks'\) delete filters\.content_id;/);

  // پارسر همچنان برای سازگاری `content_id` را می‌خواند؛ حذف در لایهٔ نمایش انجام می‌شود.
  assert.deepEqual(parseListQuery('?content_id=42', 'tasks'), { content_id: '42' });
});

test('فیلتر پروژهٔ صفحهٔ وظایف با جست‌وجو کار می‌کند', async () => {
  const [view, combo] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/common/SearchableSelect.tsx'),
  ]);

  assert.match(view, /import \{ SearchableSelect \} from '\.\.\/common\/SearchableSelect';/);
  assert.match(view, /ariaLabel="فیلتر پروژه"/);
  assert.match(view, /searchPlaceholder="جست‌وجوی پروژه…"/);
  assert.match(view, /options=\{app\.projects\.map\(project => \(\{ value: String\(project\.id\), label: project\.name \}\)\)\}/);
  assert.match(view, /onChange=\{next => update\('project_id', next\)\}/);

  // دیگر `select` ساده‌ای برای پروژه در این پنل نیست.
  assert.doesNotMatch(view, /<Select aria-label="فیلتر پروژه"/);
  // فهرست داخل body رندر می‌شود و ورودی جست‌وجو دارد.
  assert.match(combo, /createPortal\(panel, document\.body\)/);
});

test('فیلتر وضعیت وظیفه از تنظیمات وضعیت‌ها ساخته می‌شود', async () => {
  const view = await source('../src/components/workspace/WorkspaceList.tsx');

  assert.match(view, /aria-label="فیلتر وضعیت وظیفه"/);
  assert.match(view, /const orderedTaskStatuses = \[\.\.\.app\.taskStatuses\]\.sort\(\(left, right\) => left\.order - right\.order\)\.filter\(status => status\.id !== 'archived'\);/);
  assert.match(view, /\{orderedTaskStatuses\.map\(status => <option key=\{status\.id\} value=\{status\.id\}>\{status\.label\}<\/option>\)\}/);
  assert.match(view, /<option value="overdue">سررسید گذشته<\/option>/);

  // شمارش فیلترهای فعال، وضعیت انتخاب‌شده را هم می‌شمارد.
  assert.match(view, /const taskAdvancedFilterCount = \['status', 'priority', 'project_id', 'sort', 'direction'\]\.filter\(key => filters\[key\]\)\.length/);
});

test('انتخاب «سررسید گذشته» روی پارامتر درست سرور می‌نشیند', async () => {
  const view = await source('../src/components/workspace/WorkspaceList.tsx');

  // سرور برای وظایف `status=overdue` را به `due=overdue` تبدیل می‌کند، پس کادر
  // انتخاب باید مقدارش را از همان `due` بخواند و `status` را تکراری نسازد.
  assert.deepEqual(parseListQuery('?status=overdue', 'tasks'), { due: 'overdue' });
  assert.deepEqual(parseListQuery('?status=in_progress', 'tasks'), { status: 'in_progress' });

  assert.match(view, /const taskStatusFilterValue = filters\.status \|\| \(\(filters\.due \|\| ''\) === 'overdue' \? 'overdue' : ''\);/);
  assert.match(view, /if \(\(filters\.due \|\| ''\) === 'overdue'\) nextParams\.delete\('due'\);/);
  assert.match(view, /nextParams\.set\('due', 'overdue'\);/);
  assert.match(view, /const applyTaskStatusFilter = \(next: string\) => \{/);
  assert.match(view, /onChange=\{event => applyTaskStatusFilter\(event\.target\.value\)\}/);
});
