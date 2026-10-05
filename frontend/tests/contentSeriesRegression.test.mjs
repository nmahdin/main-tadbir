import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../src/components/content/ContentSeriesView.tsx', import.meta.url), 'utf8');
const form = readFileSync(new URL('../src/components/content/series/SeriesForm.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/api/series.ts', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const contentDetail = readFileSync(new URL('../src/components/content/ContentDetailView.tsx', import.meta.url), 'utf8');
const contentList = readFileSync(new URL('../src/components/content/ContentMainView.tsx', import.meta.url), 'utf8');
const publishedList = readFileSync(new URL('../src/components/content/ContentPublishedView.tsx', import.meta.url), 'utf8');

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

test('series occurrence identity and publication timing are explained and configured in the form', () => {
  assert.match(form, /پیشوند کد مجموعه/);
  assert.match(form, /عیناً ابتدای کد و عنوان هر رخداد/);
  assert.match(form, /نخستین رخداد «هفته ۱»/);
  assert.match(form, /ساعت انتشار هر رخداد/);
  assert.match(form, /defaultPublicationConfig: \{[\s\S]*channels, status: 'planned', visibility, time: publicationTime/);
});

test('series supports finite scheduling, stage assignments and one-off occurrence overrides', () => {
  assert.match(form, /تاریخ شروع مجموعه/);
  assert.match(form, /تاریخ پایان مجموعه/);
  assert.match(form, /تعداد کل محتوای برنامه‌ریزی‌شده/);
  assert.doesNotMatch(form, /ساعت فعال‌سازی جریان کار|مهلت از شروع|لنگر تقویم سازمان/);
  assert.match(form, /مسئول اجرا و ارزیابی مراحل/);
  assert.match(form, /ناشر پیش‌فرض/);
  assert.match(form, /هدف رسانه‌ای/);
  assert.match(form, /platformIcon\(platform\.iconName\)/);
  assert.match(view, /OccurrenceCreateModal/);
  assert.match(view, /publicationDate: draft\.publicationDate/);
  assert.match(view, /stageAssignments/);
  assert.match(api, /processTemplateId\?: string \| null/);
  assert.match(types, /occurrenceLimit\?: number/);
});

test('content copy lives in content lists while details show linked series and a compact follow action', () => {
  assert.doesNotMatch(contentDetail, /duplicateContent/);
  assert.match(contentDetail, /مجموعه: \{connectedSeries\?\.name/);
  assert.match(contentDetail, /rounded-xl border border-slate-200 bg-white px-3\.5 py-2 text-xs/);
  assert.match(contentList, /duplicateContent\(content\.id\)/);
  assert.match(publishedList, /duplicateContent\(content\.id\)/);
  assert.match(contentList, /ساعت \$\{content\.publishInfo\.time\}/);
  assert.match(publishedList, /content\.publishInfo\?\.time/);
});
