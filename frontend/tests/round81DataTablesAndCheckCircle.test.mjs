import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۸۱ — جدول اطلاعات: حالت بارگذاری، تعداد ردیف در صفحه، فوتر ثابت و
 * تیکِ گرد وظایف مرتبط در پروندهٔ محتوا.
 *
 * چهار خواستهٔ کاربر:
 *  ۱) با کلیک روی یک «جدول اطلاعات» حالت بارگذاری دیده شود؛
 *  ۲) امکان انتخاب «تعداد ردیف در هر صفحه» برای جدول‌های اطلاعات؛
 *  ۳) فوتر (شمارش + قبلی/بعدی) از ناحیهٔ اسکرول افقی جدا و ثابت باشد؛
 *  ۴) آیکون تیک هر تسک در تب «وظایف مرتبط» پروندهٔ محتوا، گرد باشد.
 */
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const tables = read('../src/components/dam/DamDataTables.tsx');
const css = read('../src/index.css');
const related = read('../src/components/workspace/RelatedRecords.tsx');

test('باز کردن جدول اطلاعات حالت بارگذاری نشان می‌دهد', () => {
  // اسکلت شکل خودِ شیت + متن زنده برای صفحه‌خوان.
  assert.match(tables, /aria-label="در حال باز کردن جدول"/);
  assert.match(tables, /در حال باز کردن جدول و دریافت ردیف‌ها…/);
  assert.match(tables, /\[0, 1, 2, 3, 4, 5\]\.map\(row => \(/);
  assert.match(tables, /ui-skeleton h-3 flex-1/);
  // همان لحظه، کارت خود جدول هم اسپینر و «در حال باز کردن…» می‌گیرد.
  assert.match(tables, /const \[openingId, setOpeningId\] = useState<number \| null>\(null\);/);
  assert.match(tables, /setOpeningId\(id\);/);
  assert.match(tables, /setOpeningId\(null\);/);
  assert.match(tables, /aria-busy=\{openingId === table\.id\}/);
  assert.match(tables, /'در حال باز کردن…'/);
});

test('تعداد ردیف در صفحه برای جدول‌های اطلاعات قابل انتخاب است', () => {
  assert.match(tables, /const ROWS_PER_PAGE_OPTIONS = \[20, 50, 100\];/);
  assert.match(tables, /const ROWS_PER_PAGE_KEY = 'tadbir:dam:tables:perPage';/);
  assert.match(tables, /const readRowsPerPage = \(\): number => \{/);
  assert.match(tables, /const \[rowsPerPage, setRowsPerPage\] = useState<number>\(readRowsPerPage\);/);
  // مقدار انتخاب‌شده به سرور می‌رود و در مرورگر می‌ماند.
  assert.match(tables, /per_page: String\(perPage \?\? rowsPerPageRef\.current\)/);
  assert.match(tables, /window\.localStorage\.setItem\(ROWS_PER_PAGE_KEY, String\(rowsPerPage\)\)/);
  assert.match(tables, /aria-label="تعداد ردیف در صفحه"/);
  assert.match(tables, /ROWS_PER_PAGE_OPTIONS\.map\(option => \(/);
  // تغییر تعداد، صفحه را به ۱ برمی‌گرداند و همان‌جا دوباره می‌خواند.
  assert.match(tables, /if \(detail\) void openTable\(detail\.id, 1, filters, sortColumn, sortDirection, undefined, next\);/);
});

test('فوتر صفحه‌بندی بیرون از اسکرول افقی و ثابت است', () => {
  // دیگر فوترِ چسبیده داخل ناحیهٔ اسکرول وجود ندارد.
  assert.doesNotMatch(tables, /sticky bottom-0 flex items-center justify-between border-t/);
  // ناحیهٔ اسکرول فقط جدول را نگه می‌دارد و فوتر بعد از بسته‌شدن آن می‌آید.
  const scroller = tables.indexOf('className="min-h-0 flex-1 overflow-auto"');
  const footer = tables.indexOf('data-table-footer');
  assert.ok(scroller > 0 && footer > scroller, 'فوتر باید بعد از ناحیهٔ اسکرول رندر شود.');
  // فوتر مستقل از حالت بارگذاری است (`detail &&`)، پس با عوض‌شدن صفحه ناپدید نمی‌شود.
  assert.match(tables, /\{detail && \(\s*<footer/);
  assert.match(tables, /data-table-footer/);
  // شمارش «نمایش x تا y از z» و دکمه‌های ۳۶ پیکسلی قبلی/بعدی.
  assert.match(tables, /نمایش \$\{Math\.min\(\(\(detail\.rows_meta\.current_page - 1\) \* detail\.rows_meta\.per_page\) \+ 1, detail\.rows_meta\.total\)/);
  assert.match(tables, /ui-button ui-button-secondary !min-h-9 !rounded-xl !px-3 !py-1\.5 disabled:opacity-40/);
});

test('تیک وظایف مرتبط گرد است و قاعدهٔ پایهٔ دکمه‌ها آن را نمی‌شکند', () => {
  // خودِ کنترل: دایره + کلاس صریح.
  assert.match(related, /ui-check-circle flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2/);
  // قاعدهٔ پایهٔ `button` گردی `--radius-md` می‌گذارد و بیرون از لایه‌های تیلویند
  // است، پس بر `rounded-full` غالب می‌شد؛ این قاعده بعد از آن می‌آید.
  assert.match(css, /button\.rounded-full,\s*\[role='button'\]\.rounded-full,\s*\.ui-check-circle \{\s*border-radius: 9999px;/);
  const base = css.indexOf("button, [role='button'] {\n  border-radius: var(--radius-md);");
  const override = css.indexOf('button.rounded-full,');
  assert.ok(base > 0 && override > base, 'قاعدهٔ دایره باید بعد از قاعدهٔ پایه بیاید.');
});
