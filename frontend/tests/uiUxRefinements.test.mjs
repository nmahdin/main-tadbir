import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('content and project header actions share system controls and matched dimensions', async () => {
  const [contents, projects] = await Promise.all([
    source('../src/components/content/ContentMainView.tsx'),
    source('../src/components/projects/ProjectsView.tsx'),
  ]);
  for (const label of ['میز انتشار', 'محتوای منتشرشده', 'محتوای جدید']) {
    const area = contents.slice(Math.max(0, contents.indexOf(label) - 400), contents.indexOf(label) + label.length);
    assert.match(area, /min-h-10/);
  }
  assert.match(projects, /<Button[\s\S]{0,220}variant="secondary"[\s\S]{0,260}الگوهای آماده پروژه/);
  assert.match(projects, /<Button[\s\S]{0,220}action="create"[\s\S]{0,260}ایجاد پروژه جدید/);
});

test('series search, icon actions, next occurrence panel and content rows retain the refinements', async () => {
  const [series, form] = await Promise.all([
    source('../src/components/content/ContentSeriesView.tsx'),
    source('../src/components/content/series/SeriesForm.tsx'),
  ]);
  assert.match(series, /id="series-search"[\s\S]{0,260}className="w-full !pr-10"/);
  for (const label of ['مشاهده مجموعه', 'ویرایش تنظیمات آینده مجموعه', 'بایگانی مجموعه']) {
    assert.match(series, new RegExp(`IconButton label="${label}"`));
  }
  assert.match(series, /پروندهٔ محتوای بعدی/);
  assert.match(series, /ContentStatusBadge status=\{content\.status\}/);
  assert.match(series, /role="progressbar"/);
  assert.match(form, /مرحله بعد<ChevronLeft[\s\S]{0,180}min-h-10|className="min-h-10 px-4"[\s\S]{0,180}مرحله بعد/);
});

test('attachment composer uses the shared root folder picker and folder-scoped repository browsing', async () => {
  const composer = await source('../src/components/common/AttachmentComposer.tsx');
  assert.match(composer, /<FolderBrowserModal/);
  assert.match(composer, /onCreate=\{createFolder\}/);
  assert.match(composer, /folder_id: String\(folderId \|\| 0\)/);
  assert.match(composer, /مرور پوشه‌ای مخزن/);
  assert.match(composer, /libraryChildFolders\.map\(folder/);
  assert.doesNotMatch(composer, /<Select aria-label="محل ذخیره در مخزن"/);
});

test('task detail exposes Persian deadline plus navigable project and content relations', async () => {
  const detail = await source('../src/components/tasks/TaskDetailDrawer.tsx');
  assert.match(detail, /formatToJalaliFull\(task\.deadline\)/);
  assert.match(detail, /label="پروژه مرتبط"[\s\S]{0,420}setActiveView\('project-detail'\)/);
  assert.match(detail, /label="محتوای مرتبط"[\s\S]{0,500}setActiveView\('content-detail'\)/);
  assert.match(detail, /<PriorityPill priority=\{task\.priority\}[\s\S]{0,240}task\.tags\.map/);
});

test('content detail returns to its actual origin and content list exposes series fallback and type filtering', async () => {
  const [detail, list] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/ContentMainView.tsx'),
  ]);
  assert.match(detail, /const goBack = \(\) =>/);
  assert.match(detail, /safeReturnTo\(explicitReturn, '\/contents'\)/);
  assert.match(detail, /navigate\(-1\)/);
  assert.match(detail, /detailTabs\.map/);
  assert.match(list, /value=\{typeFilter\}/);
  assert.match(list, /content\.seriesName \|\| 'عمومی'/);
  assert.match(list, /aria-label=\{`پیشرفت جریان محتوا/);
});

test('my workspace defaults to near due work and keeps an explicit all-tasks tab', async () => {
  const tasks = await source('../src/components/tasks/MyTasksView.tsx');
  assert.match(tasks, /useUrlFilter<TaskScope>\('scope', 'near'\)/);
  assert.match(tasks, /موعد نزدیک/);
  assert.match(tasks, /هفت روز آینده/);
  assert.match(tasks, /taskScope === 'all'/);
  assert.match(tasks, /const isNearDue =/);
});
