import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * خطای گزارش‌شده: «can't access property "trim", D is null» هنگام ویرایش الگوی
 * فرایند. منبع، فیلدهای nullable الگوی ذخیره‌شده (توضیحات/متن چک‌لیست/عنوان) بود
 * که مستقیم به trim می‌رسید. این تست همان مسیر را قفل می‌کند.
 */
test('الگوی فرایند: مقدارهای null پیش از trim نرمال می‌شوند', async () => {
  const [modal, util, app] = await Promise.all([
    source('../src/components/settings/ProcessTemplateModal.tsx'),
    source('../src/utils/contentProcessTemplates.ts'),
    source('../src/context/AppContext.tsx'),
  ]);

  // نرمال‌ساز مشترک: رشته می‌ماند، عدد به رشته، و null/undefined به رشتهٔ خالی.
  assert.match(util, /export const safeText = \(value: unknown\): string => \{/);
  assert.match(util, /if \(typeof value === 'string'\) return value;/);
  assert.match(util, /return '';/);
  assert.match(util, /export const normalizeProcessTemplate/);
  assert.match(util, /record\.text \?\? record\.label \?\? record\.title/);

  // مسیر خواندن: الگو پیش از نشستن در state نرمال می‌شود.
  assert.match(modal, /const normalized = normalizeProcessTemplate\(template\);/);
  assert.match(modal, /setName\(normalized\.name\);/);
  assert.match(modal, /setDescription\(normalized\.description\);/);

  // مسیر ذخیره: هیچ trim مستقیمی روی مقدار خام نمی‌ماند.
  assert.match(modal, /name: safeText\(name\)\.trim\(\)/);
  assert.match(modal, /description: safeText\(description\)\.trim\(\)/);
  assert.match(modal, /text: safeText\(item\.text\)\.trim\(\)/);
  assert.doesNotMatch(modal, /description\.trim\(\)/);
  assert.doesNotMatch(modal, /item\.text\.trim\(\)/);
  assert.doesNotMatch(modal, /!name\.trim\(\)/);

  // ورودی‌های کنترل‌شده هیچ‌وقت null نمی‌گیرند.
  assert.match(modal, /value=\{stage\.title \?\? ''\}/);
  assert.match(modal, /value=\{stage\.description \?\? ''\}/);
  assert.match(modal, /value=\{item\.text \?\? ''\}/);

  // خطای خام جاوااسکریپت به کاربر نشان داده نمی‌شود.
  assert.match(modal, /ذخیرهٔ الگو انجام نشد؛ ورودی‌ها را بررسی کنید و دوباره تلاش کنید\./);

  // الگوهای دریافتی از تنظیمات سازمان هم پیش از رسیدن به رابط نرمال می‌شوند.
  assert.match(app, /setProcessTemplates\(normalizeProcessTemplates\(settingsData\.process_templates\)\)/);
  assert.match(app, /normalizeProcessTemplate\(\{ \.\.\.t, \.\.\.updates \}\)/);
});

test('ویرایش جریان محتوا: عنوان مرحلهٔ null ذخیره را نمی‌شکند', async () => {
  const workflow = await source('../src/components/content/EditWorkflowModal.tsx');
  assert.match(workflow, /stages\.findIndex\(stage => !\(stage\.title \|\| ''\)\.trim\(\)\)/);
  assert.match(workflow, /title: \(stage\.title \|\| ''\)\.trim\(\)/);
  assert.match(workflow, /value=\{stage\.title \?\? ''\}/);
});

test('نرمال‌ساز الگو با دادهٔ ناقص کرش نمی‌کند', async () => {
  const { normalizeProcessTemplate, normalizeProcessTemplates, safeText } = await import('../src/utils/contentProcessTemplates.ts');
  assert.equal(safeText(null), '');
  assert.equal(safeText(undefined), '');
  assert.equal(safeText(42), '42');
  assert.equal(safeText('  متن '), '  متن ');

  const normalized = normalizeProcessTemplate({
    id: 'tpl-1',
    name: null,
    type: 'video',
    description: null,
    stages: [
      { stageKey: 'a', title: null, description: null, departmentId: null, checklist: [{ id: 'c1', text: null }, { label: 'گام دوم' }, 'گام سوم'] },
      null,
    ],
  });
  assert.equal(normalized.name, '');
  assert.equal(normalized.description, '');
  assert.equal(normalized.stages.length, 1);
  assert.equal(normalized.stages[0].title, '');
  assert.equal(normalized.stages[0].description, '');
  assert.equal(normalized.stages[0].dependsOnPrevious, false);
  assert.deepEqual(normalized.stages[0].checklist.map(item => item.text), ['گام دوم', 'گام سوم']);
  assert.deepEqual(normalizeProcessTemplates(null), []);
  assert.deepEqual(normalizeProcessTemplates([{ id: 'x' }]).map(item => item.id), ['x']);
});
