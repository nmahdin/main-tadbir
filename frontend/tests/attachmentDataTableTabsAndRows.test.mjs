import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataTableRowFields } from '../src/utils/dataTableRows.ts';

const composer = readFileSync(new URL('../src/components/common/AttachmentComposer.tsx', import.meta.url), 'utf8');

/**
 * بخش «جدول اطلاعات» در قالب ضمیمه‌ها: سه حالت زیر هم نمایش داده می‌شوند و در
 * تب «اتصال ردیف‌های موجود» محتوای کامل هر ردیف (نه خلاصه) دیده می‌شود.
 */
test('the three table modes are stacked vertically, not side by side', () => {
  // ظرف تب‌ها ستونی است و دکمه‌ها تمام‌عرض/راست‌چین
  assert.match(composer, /role="tablist" aria-orientation="vertical" aria-label="حالت‌های جدول اطلاعات" className="relative flex flex-col gap-1/);
  assert.match(composer, /className=\{`relative z-10 flex w-full items-start gap-2 rounded-lg px-3 py-2 text-right/);
  // دور ۹۵: نشانگر روشن بین حالت‌ها بالا/پایین می‌رود.
  assert.match(composer, /const tableModeTabs = useSlidingTabs\(activeTableOperation, 'light'\);/);
  // حالت‌های قدیمیِ کنارهم (`flex-1` در ردیف افقی) حذف شده‌اند
  assert.doesNotMatch(composer, /flex rounded-xl border border-slate-200 bg-slate-50 p-1/);
  assert.doesNotMatch(composer, /className=\{`flex-1 rounded-lg px-3 py-2 text-\[11px\] font-bold/);
  // همان سه حالت با ردیف راهنما زیر عنوان
  for (const label of ['افزودن ردیف به جدول موجود', 'ساخت جدول جدید', 'اتصال ردیف‌های موجود']) {
    assert.match(composer, new RegExp(label));
  }
  assert.match(composer, /role="tab"\s*\n\s*aria-selected=\{active\}/);
});

test('linking rows shows the full content of every row instead of a one-line summary', () => {
  // خلاصهٔ بریده‌شده (`truncate` + dataTableRowLabel) دیگر در فهرست ردیف‌ها نیست
  assert.doesNotMatch(composer, /<span className="block truncate font-black text-slate-700">\{dataTableRowLabel\(row, selectedTable\.columns \|\| \[\]\)\}/);
  // همهٔ ستون‌های پرشده با نام خودشان، شکسته و کامل نمایش داده می‌شوند
  assert.match(composer, /const fields = dataTableRowFields\(row\.cells, selectedTable\.columns \|\| \[\]\);/);
  assert.match(composer, /<span className="block whitespace-pre-wrap break-words text-\[11px\] font-black leading-5 text-slate-700">\{field\.value\}<\/span>/);
  assert.match(composer, /<span className="block text-\[9px\] font-bold text-slate-400">\{field\.name\}<\/span>/);
  // ردیف بدون مقدار هم پیام روشن دارد
  assert.match(composer, /ردیف بدون مقدار/);
});

test('dataTableRowFields keeps every filled column, including historical ones', () => {
  const columns = [
    { id: 'c1', name: 'عنوان' },
    { id: 'c2', name: 'توضیح' },
    { id: 'c3', name: 'خالی' },
  ];
  const fields = dataTableRowFields(
    { c1: 'خبر هفته', c2: 'متن کامل و طولانی این ردیف که نباید خلاصه شود', c3: '', old: 'ستون قدیمی' },
    columns,
  );
  assert.deepEqual(fields.map(field => field.id), ['c1', 'c2', 'old']);
  assert.equal(fields[1].value, 'متن کامل و طولانی این ردیف که نباید خلاصه شود');
  assert.equal(fields[2].name, 'old');
  // بدون سقف پیش‌فرض: برای نمایش کامل هیچ ستونی حذف نمی‌شود
  assert.equal(fields.length, 3);
  assert.deepEqual(dataTableRowFields({}, columns), []);
});
