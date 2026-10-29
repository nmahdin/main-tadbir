import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * بارگذاری فهرست وظایف با خطای «مقدار انتخاب‌شده برای direction معتبر نیست»
 * شکست می‌خورد، چون کلید `direction` با مقدار `undefined` به نشانی می‌رفت
 * (`direction=undefined`). این آزمون تضمین می‌کند پارامترهای بی‌مقدار ارسال
 * نشوند و جهتِ پیش‌فرض وظایف همیشه مقدار معتبر داشته باشد.
 */
test('فهرست‌ها پارامتر بی‌مقدار به سرور نمی‌فرستند', async () => {
  const pages = await source('../src/queries/workspacePages.ts');

  assert.match(pages, /export function listParams\(params: Record<string, string \| number \| undefined \| null>\): Array<\[string, string\]>/);
  assert.match(pages, /\.filter\(\(\[, value\]\) => value !== undefined && value !== null && String\(value\)\.trim\(\) !== ''\)/);
  // ساختِ نشانی فقط از مسیر listParams انجام می‌شود، نه Object.entries خام.
  assert.match(pages, /new URLSearchParams\(listParams\(params\)\)/);
  assert.doesNotMatch(pages, /Object\.entries\(params\)\.map\(\(\[k,v\]\) => \[k, String\(v\)\]\)/);
});

test('جهتِ پیش‌فرضِ مرتب‌سازیِ وظایف و پروژه‌ها مقدار معتبر دارد', async () => {
  const list = await source('../src/components/workspace/WorkspaceList.tsx');

  // محتوا صعودی (نزدیک‌ترین انتشار) و بقیه نزولی (تازه‌ترین) است؛ هیچ‌کدام undefined نیست.
  assert.match(list, /const defaultDirection = module === 'contents' \? 'asc' : 'desc';/);
  assert.match(list, /direction: filters\.direction \|\| defaultDirection/);
  assert.doesNotMatch(list, /defaultDirection = module === 'contents' \? 'asc' : undefined/);
});

test('پارامترهای فیلتر فقط با مقدارِ واقعی به سرور می‌روند', async () => {
  const pages = await source('../src/queries/workspacePages.ts');
  // مقدار خالی (پس از پاک‌کردن فیلتر) هم نباید ارسال شود؛ Rule::in آن را رد می‌کند.
  assert.match(pages, /String\(value\)\.trim\(\) !== ''/);
});
