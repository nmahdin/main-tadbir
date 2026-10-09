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

test('series workspace exposes cleaner views and only the four supported detail tabs', () => {
  for (const label of ['پرونده‌های محتوا', 'تقویم آینده', 'پیش‌فرض‌ها', 'نسخه‌ها']) assert.match(view, new RegExp(label));
  assert.doesNotMatch(view, /id: 'activity'/);
  assert.doesNotMatch(view, /id: 'integrity'/);
  assert.match(view, /filtersOpen/);
  assert.match(view, /viewMode.*'list'.*'grid'/);
  assert.match(view, /SeriesRowActions/);
  assert.match(view, /row\.access\?\.archive[\s\S]*onArchive/);
  assert.doesNotMatch(`${view}\n${form}`, /رخداد/);
  assert.match(view, /seriesApi\.occurrences\([\s\S]*search: occurrenceSearch/);
});

test('single and batch retries retain stable request keys and submit optimistic lock versions', () => {
  assert.match(view, /nextRequestKey/);
  assert.match(view, /batchRequestKey/);
  assert.match(view, /if \(!nextRequestKey\) setNextRequestKey\(crypto\.randomUUID\(\)\)/);
  assert.match(view, /if \(!batchRequestKey\) setBatchRequestKey\(crypto\.randomUUID\(\)\)/);
  assert.match(api, /requestKey: string;[\s\S]*lockVersion: number/);
  assert.match(api, /commands\/\$\{command\}/);
});

test('series form remains stepped and declares Jalali, manual dates, selectable templates and DAM references', () => {
  assert.match(form, /const steps =/);
  assert.match(form, /تقویم جلالی سازمان/);
  assert.match(form, /تاریخ شروع و مهلت در زمان ایجاد به‌صورت صریح/);
  assert.match(form, /applyTemplate:/);
  assert.doesNotMatch(form, /سطح نمایش پیش‌فرض/);
  assert.match(form, /initial && <FormField label="سطح نمایش نسخه آینده"/);
  assert.match(form, /processTemplates\.map\(template/);
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

test('series content-file identity and publication timing are explained and configured in the form', () => {
  assert.match(form, /پیشوند کد مجموعه/);
  assert.match(form, /عیناً ابتدای کد و عنوان هر پروندهٔ محتوا/);
  assert.match(form, /نخستین پروندهٔ محتوا «هفته ۱»/);
  assert.match(form, /ساعت انتشار هر پروندهٔ محتوا/);
  assert.match(form, /defaultPublicationConfig: \{[\s\S]*channels, status: 'planned', \.\.\.\(initial \? \{ visibility \} : \{\}\), time: publicationTime/);
});

test('series supports finite scheduling, stage assignments and one-off content-file overrides', () => {
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


test('content list and detail expose configured colors, workflow progress, publication editing and unified attachments', () => {
  assert.match(contentList, /style=\{typeBadgeStyle\(content\.type\)\}/);
  assert.match(contentList, /مرحله \{toPersianDigits\(progress\.current\)\} از/);
  assert.doesNotMatch(contentList, /مسئول اصلی<\/th>/);
  assert.match(contentList, /content\.seriesName/);
  assert.match(contentDetail, /ویرایش تنظیمات انتشار/);
  assert.match(contentDetail, /formatToJalaliNumber\(content\.publishInfo\.date\)/);
  assert.match(contentDetail, /پیوست‌های دیگر/);
  assert.match(contentDetail, /workflowInputs/);
  assert.match(contentDetail, /INPUT_ASSET_ROLES/);
  assert.match(contentDetail, /OUTPUT_ASSET_ROLES/);
  for (const label of ['فایل‌های ورودی', 'فایل‌های خروجی', 'پیوست‌های دیگر']) assert.match(contentDetail, new RegExp(label));
  assert.doesNotMatch(contentDetail, /workflowProgress\.toLocaleString\('fa-IR'\)\}٪ —/);
  assert.match(contentDetail, /replyToId/);
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
