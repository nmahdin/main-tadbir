import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../src/components/content/ContentSeriesView.tsx', import.meta.url), 'utf8');
const form = readFileSync(new URL('../src/components/content/series/SeriesForm.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/api/series.ts', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');

test('series workspace exposes server-filtered operations, revisions, audit and read-only integrity tabs', () => {
  for (const label of ['رخدادها', 'تقویم آینده', 'پیش‌فرض‌ها', 'نسخه‌ها', 'تاریخچه', 'یکپارچگی']) {
    assert.match(view, new RegExp(label));
  }
  assert.match(view, /seriesApi\.occurrences\([\s\S]*search: occurrenceSearch/);
  assert.match(view, /فقط خواندنی/);
  assert.doesNotMatch(view, /auto.?repair/i);
});

test('single and batch retries retain stable request keys and submit optimistic lock versions', () => {
  assert.match(view, /nextRequestKey/);
  assert.match(view, /batchRequestKey/);
  assert.match(view, /if \(!nextRequestKey\) setNextRequestKey\(crypto\.randomUUID\(\)\)/);
  assert.match(view, /if \(!batchRequestKey\) setBatchRequestKey\(crypto\.randomUUID\(\)\)/);
  assert.match(api, /requestKey: string;[\s\S]*lockVersion: number/);
  assert.match(api, /commands\/\$\{command\}/);
});

test('series form remains stepped and declares Jalali, manual dates, templates, publication visibility and DAM references', () => {
  assert.match(form, /const steps =/);
  assert.match(form, /تقویم جلالی سازمان/);
  assert.match(form, /تاریخ شروع و مهلت در زمان ایجاد به‌صورت صریح/);
  assert.match(form, /applyTemplate:/);
  assert.match(form, /سطح نمایش پیش‌فرض/);
  assert.match(form, /دارایی‌های مرجع DAM/);
  assert.match(form, /lockVersion: initial\?\.lockVersion/);
});

test('series and occurrence contracts expose immutable revision and indexed activation metadata', () => {
  assert.match(types, /interface SeriesRevision/);
  assert.match(types, /lockVersion: number/);
  assert.match(types, /seriesRevisionId\?: string/);
  assert.match(types, /plannedStartAt\?: string/);
  assert.match(types, /seriesActivatedAt\?: string/);
});
