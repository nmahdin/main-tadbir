import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const patterns = readFileSync(new URL('../src/components/common/WorkspacePatterns.tsx', import.meta.url), 'utf8');
const comments = readFileSync(new URL('../src/components/comments/CommentsView.tsx', import.meta.url), 'utf8');

/**
 * دور ۶۰: کنترل «تعداد در صفحه» در نوار صفحه‌بندی جدول‌ها (مثل فهرست محتواها).
 * `.ui-input` به همهٔ کنترل‌ها عرض ۱۰۰٪ می‌داد، پس این انتخابگر هم تمام‌عرض
 * می‌شد و متن «تعداد در صفحه» فشرده و چندخطی می‌شد.
 */
test('انتخابگر «تعداد در صفحه» عرض ثابت و کوچک دارد، نه عرض کامل فیلد', () => {
  const rule = css.match(/select\.per-page-select \{([^}]*)\}/)?.[1] || '';
  assert.ok(rule, 'قاعدهٔ select.per-page-select باید در index.css باشد');
  assert.match(rule, /width: 4\.75rem !important;/);
  assert.match(rule, /min-width: 4\.75rem;/);
  assert.match(rule, /max-width: 4\.75rem;/);
  assert.match(rule, /flex: 0 0 auto;/);
  // جای فلش انتخابگر و پدینگ متن، اندازهٔ خودِ کنترل کوچک است.
  assert.match(rule, /padding-left: 1\.9rem !important;/);
  assert.match(rule, /padding-right: \.5rem !important;/);
  assert.match(rule, /padding-top: \.25rem !important;/);
  assert.match(rule, /padding-bottom: \.25rem !important;/);
  // هم‌قد دکمه‌های «صفحه قبل/بعد» تا نوار صفحه‌بندی یک خط تمیز بماند.
  assert.match(rule, /height: var\(--button-height\);/);
  assert.match(rule, /min-height: var\(--button-height\);/);

  // ۷۶ پیکسل عرض، منهای پدینگ‌ها، برای «۱۰۰» فارسی کافی است.
  const available = 4.75 * 16 - 1.9 * 16 - 0.5 * 16;
  assert.ok(available >= 32, `فضای متن باید دست‌کم ۳۲ پیکسل باشد، نه ${available}`);
});

test('برچسب «تعداد در صفحه» نمی‌شکند و کنترل از جای خودش بیرون نمی‌زند', () => {
  assert.match(
    patterns,
    /<label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-bold text-slate-500">/,
  );
  assert.match(patterns, /<span className="shrink-0">تعداد در صفحه<\/span>/);
  assert.match(patterns, /<Rows3 aria-hidden="true" className="h-4 w-4 shrink-0" \/>/);
  assert.match(patterns, /className="per-page-select"/);
  // کلاس‌های عرض/پدینگ قبلی که با `.ui-input` تداخل داشتند حذف شده‌اند.
  assert.doesNotMatch(patterns, /className="w-20 py-1\.5 text-xs"/);
  assert.match(patterns, /aria-label="تعداد موارد در صفحه"/);
  assert.match(patterns, /\{perPageOptions\.map\(option => /);
});

test('همان کنترل در فهرست دیدگاه‌ها هم ظاهر یکسان دارد', () => {
  assert.match(comments, /className="per-page-select rounded-xl border border-slate-200 bg-white text-xs"/);
  assert.match(comments, /تعداد در صفحه<select/);
  assert.doesNotMatch(comments, /className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"/);
});

test('دکمه‌های «صفحه قبل/بعد» ۳۶px و دارای سایهٔ جزئی هستند', () => {
  const rule = css.match(/\.pagination-button \{([^}]*)\}/)?.[1] || '';
  assert.ok(rule, 'قاعدهٔ .pagination-button باید در index.css باشد');
  assert.match(rule, /height: var\(--button-height\);/);
  assert.match(rule, /min-height: var\(--button-height\);/);
  assert.match(rule, /box-shadow: var\(--button-shadow\) !important;/);
  assert.match(css, /\.pagination-button:active:not\(:disabled\) \{[^}]*box-shadow: var\(--button-shadow-pressed\) !important;/);

  // هر دو دکمهٔ نوار صفحه‌بندی همین کلاس را دارند و سایهٔ قدیمی (که قاعدهٔ
  // سراسری دکمه‌ها آن را خنثی می‌کرد) حذف شده است.
  assert.equal((patterns.match(/className="pagination-button border border-slate-200 bg-white hover:bg-slate-50"/g) || []).length, 2);
  assert.doesNotMatch(patterns, /shadow-xs/);
  assert.match(patterns, /صفحه قبل/);
  assert.match(patterns, /صفحه بعد/);
});
