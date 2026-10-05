import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('content creation keeps the three-step form and uploads initial sources only after server content exists', async () => {
  const modal = await source('../src/components/content/CreateContentModal.tsx');
  for (const label of ['مشخصات محتوا', 'برنامه انتشار', 'جریان محتوا', 'فایل اولیه / منابع اولیه']) assert.match(modal, new RegExp(label));
  assert.ok(modal.indexOf('await addContent') < modal.indexOf('await persistAttachmentDraft'));
  assert.match(modal, /contentBucket: 'inputs'/);
  assert.match(modal, /relationRole: 'initial_input'/);
  assert.match(modal, /createdContent \? 'تلاش مجدد فایل‌های اولیه'/);
  assert.match(modal, /files: source\.kind === 'file'.*filter/s);
});

test('workflow editor is gated by the narrow workflow permission, not content edit', async () => {
  const [detail, editor] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/EditWorkflowModal.tsx'),
  ]);
  assert.match(detail, /hasPermission\('content\.workflow\.manage'\)/);
  assert.match(editor, /hasPermission\('content\.workflow\.manage'\)/);
  assert.doesNotMatch(editor, /canManageWorkflow = .*content\.edit/);
});

test('DAM exposes persisted grid, professional table and quick list views', async () => {
  const library = await source('../src/components/dam/DamLibrary.tsx');
  assert.match(library, /type LibraryView = 'grid' \| 'table' \| 'list'/);
  assert.match(library, /tadbir:dam:view/);
  assert.match(library, /نمای شبکه‌ای/);
  assert.match(library, /نمای جدولی/);
  assert.match(library, /نمای فهرستی سریع/);
  assert.match(library, /TABLE_COLUMNS/);
  assert.match(library, /ستون‌ها/);
  assert.match(library, /context\?\.content_id\) relations\.push\(\['content', context\.content_id\]\)/);
});

test('DAM filter bar, breadcrumb, orphan mode and server pagination are wired', async () => {
  const library = await source('../src/components/dam/DamLibrary.tsx');
  assert.match(library, /جست‌وجوی نام، فایل، برچسب، کد یا عنوان محتوا/);
  assert.match(library, /دارایی‌های بدون ارتباط/);
  assert.match(library, /params\.set\('orphan', '1'\)/);
  assert.match(library, /dam_folder/);
  assert.match(library, />دارایی‌ها<\/button>/);
  assert.match(library, /per_page: '20'/);
});

test('DAM opens a safe side preview with relation badges and append-only versions', async () => {
  const library = await source('../src/components/dam/DamLibrary.tsx');
  assert.match(library, /AssetDetails/);
  assert.match(library, /استفاده شده در/);
  assert.match(library, /relation\.stageLabel/);
  assert.match(library, /نسخه جاری/);
  assert.match(library, /تاریخی/);
  assert.match(library, /بازیابی به‌عنوان نسخه جدید/);
  assert.match(library, /\/dam\/library\/\$\{assetId\}\/preview/);
});

test('bulk selection and safe duplicate choices remain server-authoritative', async () => {
  const library = await source('../src/components/dam/DamLibrary.tsx');
  assert.match(library, /\/dam\/library\/bulk\/move/);
  assert.match(library, /\/dam\/library\/bulk\/update/);
  assert.match(library, /\/dam\/library\/bulk\/archive/);
  for (const label of ['استفاده از فایل موجود', 'ثبت به عنوان نسخه جدید', 'لغو']) assert.match(library, new RegExp(label));
  assert.match(library, /dam_duplicate_detected/);
});

test('file library and data tables are distinct and asset cells refer to central asset IDs', async () => {
  const [library, tables] = await Promise.all([
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/dam/DamDataTables.tsx'),
  ]);
  assert.match(library, /جدول اطلاعات/);
  assert.match(library, /activeView === 'tables'/);
  assert.match(tables, /asset: 'دارایی DAM'/);
  assert.match(tables, /\/dam\/library\?per_page=50/);
  assert.match(tables, /بارگذاری دارایی جدید در کتابخانه فایل‌ها/);
  assert.match(tables, /row_page/);
  assert.match(tables, /sort_column/);
});
