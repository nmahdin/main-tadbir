import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_TABLE_COLUMN_WIDTH,
  MAX_TABLE_COLUMN_WIDTH,
  MIN_TABLE_COLUMN_WIDTH,
  dataTablePixelWidth,
  tableColumnWidth,
  tableColumnWidthLabel,
} from '../src/utils/dataTableColumns.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('اندازهٔ ستون جدول اطلاعات با مقدار معتبر محدود و پایدار می‌ماند', () => {
  assert.equal(DEFAULT_TABLE_COLUMN_WIDTH, 160);
  assert.equal(MIN_TABLE_COLUMN_WIDTH, 60);
  assert.equal(MAX_TABLE_COLUMN_WIDTH, 1200);

  // «عدد نبودن» یعنی پیش‌فرض: خالی، متن، NaN و بی‌نهایت.
  for (const value of [undefined, null, '', 'abc', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(tableColumnWidth(value), 160, `width=${String(value)}`);
  }
  // هر عدد دیگری گِرد می‌شود و داخل بازهٔ مجاز می‌ماند (بدون رفتار مبهم برای کاربر).
  assert.equal(tableColumnWidth(180), 180);
  assert.equal(tableColumnWidth('212.4'), 212);
  assert.equal(tableColumnWidth(10), 60);
  assert.equal(tableColumnWidth(0), 60);
  assert.equal(tableColumnWidth(-20), 60);
  assert.equal(tableColumnWidth(99999), 1200);
});

test('برچسب پهنای ستون به فارسی و پهنای کل برگه با ستون‌های ثابت محاسبه می‌شود', () => {
  assert.equal(tableColumnWidthLabel(undefined), '۱۶۰ پیکسل');
  assert.equal(tableColumnWidthLabel(260), '۲۶۰ پیکسل');
  assert.equal(dataTablePixelWidth([undefined, 120, 360]), 40 + (160 + 120 + 360) + 52);
});

test('جدول اطلاعات با چیدمان ثابت و colgroup رندر می‌شود تا عرض را محتوا تعیین نکند', async () => {
  const [grid, controller, migration] = await Promise.all([
    source('../src/components/dam/DamDataTables.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamDataTableController.php'),
    source('../../backend/database/migrations/2026_09_28_000001_create_dam_data_tables.php'),
  ]);

  // پهنای هر ستون از مقدار ذخیره‌شده می‌آید، نه از طول محتوا.
  assert.ok(grid.includes('const sheetWidth = dataTablePixelWidth(columns.map(column => column.width));'));
  assert.ok(grid.includes('className="table-fixed border-collapse text-xs"'));
  assert.ok(grid.includes('style={{ width: sheetWidth, minWidth: Math.min(sheetWidth, 560) }}'));
  assert.ok(grid.includes('<colgroup>') && grid.includes('</colgroup>'));
  assert.ok(grid.includes('{columns.map(column => <col key={column.id} style={{ width: tableColumnWidth(column.width) }} />)}'));
  assert.doesNotMatch(grid, /min-w-\[140px\]/);

  // تراشهٔ پهنای ستون در سرستون، همان مقدار ذخیره‌شده را نشان می‌دهد.
  assert.ok(grid.includes("setColumnModal({ mode: 'edit', column: col, focusWidth: true })"));
  assert.ok(grid.includes('<Shrink className="h-2.5 w-2.5" />{tableColumnWidthLabel(col.width)}'));
  assert.ok(grid.includes('disabled={!canEdit}'));

  // فرم ویرایش ستون: گزینه‌های آماده + مقدار دستی، و ذخیره فقط با انتخاب صریح کاربر.
  assert.ok(grid.includes("{ label: 'پیش‌فرض', value: '' }, { label: 'باریک', value: '120' }, { label: 'متوسط', value: '180' }, { label: 'پهن', value: '260' }, { label: 'خیلی پهن', value: '360' }"));
  assert.ok(grid.includes('...(width.trim() ? { width: tableColumnWidth(Number(width)) } : {}),'));
  assert.match(grid, /focusWidth/);

  // پهنای ستون در همان JSON ستون‌ها ذخیره می‌شود؛ ستون یا جدول تازه‌ای در پایگاه داده لازم نیست.
  assert.ok(controller.includes("'columns.*.width' => 'sometimes|nullable|integer|min:60|max:1200',"));
  assert.doesNotMatch(migration, /width/);
});
