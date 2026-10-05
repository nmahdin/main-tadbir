import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('data tables use the system palette, omit Bale department access, and show column-save progress', async () => {
  const [tables, library] = await Promise.all([
    source('../src/components/dam/DamDataTables.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
  ]);

  assert.doesNotMatch(tables, /BaleTableDepartments|تنظیم دسترسی دپارتمان‌ها در بله/);
  assert.doesNotMatch(tables, /emerald-|violet-/);
  assert.match(tables, /onSave: \(column: TableColumn\) => Promise<void>/);
  assert.match(tables, /aria-busy=\{saving\}/);
  assert.match(tables, /در حال ذخیره…/);
  assert.doesNotMatch(library, /همه دارایی‌ها[^\n]*summary\?\.total/);
  assert.match(library, /activeView === 'tables' \? 'bg-indigo-50 text-indigo-700'/);
});

test('the edit-content button is the centralized visual reference for every shared button', async () => {
  const [primitives, styles, detail, standards] = await Promise.all([
    source('../src/components/common/Primitives.tsx'),
    source('../src/index.css'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../../docs/ui-standards.md'),
  ]);

  assert.match(primitives, /BUTTON_REFERENCE_CLASS = 'inline-flex items-center justify-center gap-1\.5 rounded-xl px-3\.5 py-2 text-xs font-bold shadow-2xs transition-colors cursor-pointer'/);
  assert.match(primitives, /ui-button ui-button-\$\{variant\} \$\{BUTTON_REFERENCE_CLASS\}/);
  for (const token of ['--button-min-height', '--button-padding-block', '--button-padding-inline', '--button-gap', '--button-font-size', '--button-shadow']) {
    assert.match(styles, new RegExp(token));
  }
  assert.match(styles, /@layer base \{\s+button, \[role='button'\]/);
  assert.match(styles, /\.ui-button-secondary \{ background: #fff; color: #334155; border-color: #e2e8f0; \}/);
  assert.match(detail, /<Button variant="secondary" onClick=\{\(\) => setIsEditModalOpen\(true\)\}>/);
  assert.doesNotMatch(detail, /className="px-3\.5 py-2 rounded-xl[^\n]+">\s*\n\s*<Edit3/);
  assert.match(standards, /مرجع رسمی همهٔ دکمه‌ها، دکمهٔ «ویرایش محتوا» است/);
});

test('content creation and workflow corrections retain required and themed behavior', async () => {
  const [create, workflow, detail] = await Promise.all([
    source('../src/components/content/CreateContentModal.tsx'),
    source('../src/components/content/EditWorkflowModal.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
  ]);

  for (const requiredLabel of ['نوع محتوا', 'مدیر پرونده', 'پلتفرم‌های انتشار', 'عنوان مرحله', 'دپارتمان مسئول']) {
    assert.match(create, new RegExp(`${requiredLabel}[^\\n]*text-rose-500`), requiredLabel);
  }
  assert.match(create, /platformColor = \/\^#\[0-9a-f\]\{6\}\$\/i\.test\(platform\.color/);
  assert.match(create, /backgroundColor: platformBackground/);
  assert.match(workflow, /این مرحله به مرحله قبل وابسته است/);
  assert.match(workflow, /dependsOnStageIds/);
  assert.doesNotMatch(detail, /font-mono[^\n]*formatPersianDate\(stage\.deadline\)/);
  assert.match(detail, /<footer className="flex shrink-0[^>]*border-t/);
  assert.match(detail, /ui-button ui-button-secondary/);
  assert.match(detail, /ui-button ui-button-primary/);
});

test('queued files keep editable display titles while original browser filenames remain intact', async () => {
  const [composer, library] = await Promise.all([
    source('../src/components/common/AttachmentComposer.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
  ]);

  assert.match(composer, /fileDisplayNames\?: Record<string, string>/);
  assert.match(composer, /body\.append\('file', file\)/);
  assert.match(composer, /body\.append\('title', displayName\.slice/);
  assert.doesNotMatch(composer, /نام فایل اصلی:/);
  assert.match(composer, /\{sizeLabel\(file\.size\)\}/);
  assert.match(composer, /نام نمایشی فایل/);
  assert.match(library, /displayTitle: string/);
  assert.match(library, /item\.displayTitle\.trim\(\)/);
  assert.match(library, /مستقل از نام فایل اصلی/);
});

test('the cached theme is restored before first paint and refreshed only after hydration', async () => {
  const [html, app] = await Promise.all([
    source('../index.html'),
    source('../src/App.tsx'),
  ]);

  assert.ok(html.indexOf("localStorage.getItem('tadbir:theme-color')") < html.indexOf('<div id="root">'));
  assert.match(html, /document\.documentElement\.style\.setProperty\('--color-primary'/);
  assert.match(app, /if \(isWorkspaceLoading\) return/);
  assert.match(app, /localStorage\.setItem\('tadbir:theme-color', color\)/);
  assert.doesNotMatch(app, /removeProperty\('--color-primary'/);
});

test('DAM index repair surrounds the unchanged contextual migration', async () => {
  const [prepare, original, cleanup] = await Promise.all([
    source('../../backend/database/migrations/2026_10_04_000001_prepare_dam_relation_index.php'),
    source('../../backend/database/migrations/2026_10_04_000002_harden_dam_contexts_and_indexes.php'),
    source('../../backend/database/migrations/2026_10_04_000003_remove_dam_relation_repair_index.php'),
  ]);

  assert.match(prepare, /dam_relations_asset_id_repair_index/);
  assert.match(prepare, /TARGET_MIGRATION/);
  assert.match(prepare, /removePartialTargetMigration/);
  assert.match(original, /dropUnique\('dam_relations_unique'\)/);
  assert.match(cleanup, /dropIndex\(self::SUPPORT_INDEX\)/);
});
