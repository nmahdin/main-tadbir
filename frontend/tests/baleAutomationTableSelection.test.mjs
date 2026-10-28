import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * درخواست این دور در «تنظیمات بات بله ← خودکارسازی»:
 * ۱) برای عملیات «افزودن ردیف به جدول مشخص» فیلد «دپارتمان» حذف شود.
 * ۲) فهرست جدول‌ها درست لود شود؛ جدول‌های موجود (حتی بدون دپارتمان) قابل
 *    انتخاب باشند.
 */
test('خودکارسازی بات: فیلد دپارتمان از فرم ثبت ردیف حذف شده است', async () => {
  const [panel, api, automations] = await Promise.all([
    source('../src/components/bale/BaleAutomationsPanel.tsx'),
    source('../src/api/bale.ts'),
    source('../../backend/app/Bot/Bale/Automations.php'),
  ]);

  // هیچ انتخاب/برچسب دپارتمانی در پنل نمانده است.
  assert.doesNotMatch(panel, /دپارتمان مجاز/);
  assert.doesNotMatch(panel, /انتخاب دپارتمان/);
  assert.doesNotMatch(panel, /department_id: Number\(event\.target\.value\)/);
  // قاعدهٔ تازه فیلد دپارتمان ندارد و قاعدهٔ قدیمی هنگام ویرایش/ذخیره پاک می‌شود.
  assert.match(panel, /response: '', table_id: null,\n\}\);/);
  assert.match(panel, /const stripDepartment = \(\{ department_id, \.\.\.rule \}: StoredBaleRule\): BaleRule =>/);
  assert.match(panel, /rules: \(data\.rules \?\? \[\]\)\.map\(rule => stripDepartment\(rule\)\)/);
  assert.doesNotMatch(api, /department_id: number \| null;/);
  assert.match(api, /export type StoredBaleRule = BaleRule & \{ department_id\?: number \| null \};/);
  // سرور هم دپارتمان را ذخیره نمی‌کند و دسترسی را با مجوز کاربر می‌سنجد.
  assert.match(automations, /'department_id' => null\];/);
  assert.match(automations, /app\(DamTableAccess::class\)->canEdit\(\$user, \$table\)/);
  assert.match(automations, /'table_row' => empty\(\$rule\['department_id'\]\)\s*\n\s*\? 'tableform:'\.\$rule\['table_id'\]/);
});

test('خودکارسازی بات: انتخاب جدول، فهرست واقعی جدول‌های مخزن را نشان می‌دهد', async () => {
  const [panel, api, controller] = await Promise.all([
    source('../src/components/bale/BaleAutomationsPanel.tsx'),
    source('../src/api/bale.ts'),
    source('../../backend/app/Http/Controllers/Api/V1/Bale/BaleSettingsController.php'),
  ]);

  // فیلتر قبلی جدول‌های بدون دپارتمان را پنهان می‌کرد.
  assert.doesNotMatch(controller, /whereHas\('departments'\)/);
  assert.match(controller, /DamDataTable::query\(\)->orderBy\('name'\)->get\(\['id', 'name'\]\)/);
  assert.match(controller, /->map\(fn \(\$table\) => \['id' => \$table->id, 'name' => \$table->name\]\)/);
  assert.match(api, /tables: \{ id: number; name: string \}\[\];/);

  // فهرست، حالت «در حال دریافت»، خالی‌بودن و خطای خودش را نشان می‌دهد.
  assert.match(panel, /const tables = state\?\.tables \?\? \[\];/);
  assert.match(panel, /در حال دریافت جدول‌ها…/);
  assert.match(panel, /tables\.length \? `\$\{tables\.length\.toLocaleString\('fa-IR'\)\} جدول اطلاعاتی قابل انتخاب` : 'جدولی در فهرست نیست'/);
  assert.match(panel, /هیچ جدول اطلاعاتی در مخزن پیدا نشد\./);
  assert.match(panel, /به‌روزرسانی فهرست/);
  // تازه‌سازی فهرست، تغییرات ذخیره‌نشدهٔ قاعده‌ها را از بین نمی‌برد.
  assert.match(panel, /setState\(current => current \? \{ \.\.\.current, tables \} : normalizeAutomations\(response\.data\)\)/);
  // بدون انتخاب جدول، قاعده ثبت نمی‌شود.
  assert.match(panel, /if \(editing\.action === 'table_row' && !editing\.table_id\) \{/);
});

test('خودکارسازی بات: اجرای قاعده بدون دپارتمان فرم همان جدول را باز می‌کند', async () => {
  const [menus, router, tests] = await Promise.all([
    source('../../backend/app/Bot/Bale/Handlers/OperationalMenus.php'),
    source('../../backend/app/Bot/Bale/Routing/MenuRouter.php'),
    source('../../backend/tests/Feature/Bale/BaleAutomationsTest.php'),
  ]);

  assert.match(menus, /preg_match\('\/\^tableform:\(\\d\{1,18\}\)\$\/', \$action, \$m\)/);
  assert.match(menus, /\$table = \$this->table\(\$user, \(int\) \$m\[1\], null\);/);
  // دکمهٔ فرم باید همان جدول را بدون دپارتمان باز کند.
  assert.match(menus, /'table_id' => \$table->id, 'version' => DamTableRows::version\(\$table\), 'index' => 0, 'cells' => \[\]\]\);\n            \$this->fieldPrompt/);
  // مجوز assets برای این اکشن هم بررسی می‌شود.
  assert.match(router, /assets\?\$\|taskasset:\|asset\|department\|tableform/);
  assert.match(tests, /public function test_table_choices_include_tables_that_have_no_department\(\): void/);
  assert.match(tests, /public function test_table_row_rule_without_department_opens_the_form_and_commits_a_row\(\): void/);
});
