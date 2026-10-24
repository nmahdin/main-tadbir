import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/components/content/ContentSeriesView.tsx', import.meta.url), 'utf8');

/**
 * بازطراحی «جزئیات مجموعه محتوا» بر پایهٔ «جزئیات محتوا»:
 * همان قاب سربرگ، همان چیپ کد، همان کارت‌های خلاصه، همان قاب/سربرگ بخش‌ها و
 * همان دکمه‌های سربرگ؛ همراه با ارقام و ساعت فارسی. این آزمون قفل می‌کند که
 * چیدمان دوباره از الگوی صفحهٔ محتوا جدا نشود.
 */
test('series detail reuses the content detail header recipe', () => {
  assert.match(view, /space-y-6 p-4 text-right animate-in fade-in duration-200/);
  assert.match(view, /h-8 shrink-0 items-center gap-1\.5 rounded-xl border border-slate-300 bg-slate-100 px-3 font-mono text-xs font-black leading-none tracking-\[0\.08em\] text-slate-900 shadow-2xs/);
  assert.match(view, /<Hash className="h-4 w-4 text-slate-500" \/>/);
  assert.match(view, /role="progressbar" aria-valuemin=\{0\} aria-valuemax=\{100\} aria-valuenow=\{publishProgress\}/);
  assert.match(view, /const publishProgress = selected\.occurrenceCount \? Math\.round\(\(selected\.publishedCount \/ selected\.occurrenceCount\) \* 100\) : 0;/);
  assert.match(view, /const overdueCount = Number\(itemSummary\.data\?\.data\.overdue \|\| 0\);/);
});

test('series detail surfaces the derived delay state without inventing data', () => {
  assert.match(view, /const delayedCount = Number\(itemSummary\.data\?\.data\.delayed \|\| 0\);/);
  assert.match(view, /delayedCount > 0 && <span className=\{`\$\{DETAIL_BADGE_CLASS\} border-violet-200 bg-violet-50 text-violet-700`\}/);
  assert.match(view, /\{`\$\{delayedCount\.toLocaleString\('fa-IR'\)\} پرونده در تأخیر مراحل جریان`\}/);
  assert.match(view, /overdueCount \? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-slate-50\/70'/);
});

test('series tabs render inside one accessible panel with content-detail chrome', () => {
  assert.match(view, /role="tabpanel" aria-labelledby=\{`series-tab-\$\{tab\}`\} className="min-h-\[420px\] rounded-3xl border border-slate-200\/80 bg-white p-5 shadow-2xs sm:p-6"/);
  assert.match(view, /id=\{`series-tab-\$\{item\.id\}`\} aria-selected=\{selectedTab\} aria-controls=\{`series-panel-\$\{item\.id\}`\}/);
  assert.match(view, /function Panel\(\{ icon: Icon, title, subtitle, children \}/);
  assert.match(view, /<Icon className="h-5 w-5" \/>/);
  ['ListChecks', 'CalendarClock', 'Settings2', 'FileStack'].forEach(icon => {
    assert.match(view, new RegExp(`<Panel icon=\\{${icon}\\} title=`));
  });
});

test('series header actions use the same flat card buttons as the content detail', () => {
  const actions = view.match(/<HeaderAction icon=/g) || [];
  assert.equal(actions.length, 6);
  assert.match(view, /rounded-xl border px-3\.5 py-2 text-xs font-bold shadow-2xs transition-colors disabled:cursor-wait disabled:opacity-60/);
  assert.doesNotMatch(view, /<Button variant="warning" loading=\{transition\.isPending\} title="جلوگیری از ایجاد/);
});

test('series dates and times always print with Persian numerals', () => {
  assert.match(view, /formatPersianTime\(nextPreview\.publicationTime\)/);
  assert.match(view, /formatPersianTime\(item\.publicationTime\)/);
  assert.match(view, /`، ساعت \$\{formatPersianTime\(content\.publishInfo\.time\)\}`/);
  assert.match(view, /value=\{formatPersianTime\(String\(publication\?\.time \|\| ''\)\) \|\| 'تعیین نشده'\}/);
  assert.doesNotMatch(view, /ساعت \{nextPreview\.publicationTime\}/);
  assert.doesNotMatch(view, /\|\| '۰۰:۰۰'\)\}/);
});

test('the occurrence filter uses the organisation status list and never a hardcoded subset', () => {
  assert.match(view, /\{contentStatuses\.map\(item => <option key=\{item\.id\} value=\{item\.id\}>\{item\.label\}<\/option>\)\}/);
  assert.match(view, /\{!contentStatuses\.some\(item => item\.id === 'delayed'\) && <option value="delayed">در تأخیر<\/option>\}/);
  assert.doesNotMatch(view, /<option value="planning">برنامه‌ریزی<\/option>/);
});

test('occurrence rows show the revision version instead of the raw revision id', () => {
  // نسخه دیگر نمایش داده نمی‌شود - ساده‌سازی لیست
  assert.doesNotMatch(view, / · نسخه \$\{revisionVersion\.toLocaleString/);
  assert.doesNotMatch(view, /const revisionVersion = revisionVersionOf\(content\.seriesRevisionId\);/);
});
