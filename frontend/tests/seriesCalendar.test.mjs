import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SERIES_CALENDAR_TONES,
  groupSeriesCalendarEntries,
  normalizeSeriesCalendarDay,
  seriesCalendarEntries,
  seriesCalendarEntriesFromOccurrences,
  seriesCalendarEntriesFromPeriods,
  seriesCalendarSeriesRows,
  seriesCalendarTone,
} from '../src/utils/seriesCalendar.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

const SERIES = { id: 'ser-1', name: 'مجموعهٔ هفتگی گزارش' };

// دوره‌های محاسبه‌شدهٔ سرور؛ یکی بدون تاریخ است تا حذف شود.
const PERIODS = [
  { sequence: 3, periodKey: 'weekly-003', periodLabel: 'هفته ۳', title: 'گزارش هفته ۳', startDate: '2026-10-20', deadline: '2026-10-24', publicationDate: '2026-10-20', publicationTime: '09:30' },
  { sequence: 4, periodKey: 'weekly-004', periodLabel: 'هفته ۴', title: 'گزارش هفته ۴', startDate: '2026-10-27', deadline: '2026-10-31', publicationDate: '2026-10-27', publicationTime: '09:30' },
  { sequence: 5, periodKey: 'weekly-005', periodLabel: 'هفته ۵', title: 'بدون تاریخ' },
];

// پرونده‌های محتوای ثبت‌شده؛ یکی فقط تاریخ شروع برنامه‌ریزی و یکی بدون تاریخ.
const OCCURRENCES = [
  { id: 'cnt-1', title: 'گزارش هفته ۱', code: 'SER01', seriesSequence: 1, deadline: '2026-10-10', publishInfo: { date: '2026-10-06T00:00:00Z', time: '09:30' } },
  { id: 'cnt-2', title: 'گزارش هفته ۲', code: 'SER02', seriesSequence: 2, plannedStartAt: '2026-10-13T08:00:00Z', deadline: '2026-10-17', publishInfo: {} },
  { id: 'cnt-3', title: 'پروندهٔ بی‌تاریخ', seriesSequence: 9, publishInfo: {} },
];

test('series calendar days are built only from real server periods and stored case files', () => {
  // تاریخ نامعتبر یا ناقص هرگز روز نمی‌سازد.
  assert.equal(normalizeSeriesCalendarDay('2026-10-16T18:00:00Z'), '2026-10-16');
  assert.equal(normalizeSeriesCalendarDay(' 2026-10-16 '), '2026-10-16');
  assert.equal(normalizeSeriesCalendarDay('1405/07/24'), null);
  assert.equal(normalizeSeriesCalendarDay('2026-13-01'), null);
  assert.equal(normalizeSeriesCalendarDay(''), null);
  assert.equal(normalizeSeriesCalendarDay(null), null);

  const planned = seriesCalendarEntriesFromPeriods(SERIES, PERIODS);
  assert.deepEqual(planned.map(entry => entry.day), ['2026-10-20', '2026-10-27']);
  assert.deepEqual(planned.map(entry => entry.state), ['planned', 'planned']);
  assert.deepEqual(planned.map(entry => entry.sequence), [3, 4]);
  assert.equal(planned[0].time, '09:30');
  assert.equal(planned[0].deadline, '2026-10-24');
  assert.equal(planned[0].contentId, null);
  assert.equal(planned[0].seriesName, SERIES.name);

  const created = seriesCalendarEntriesFromOccurrences(SERIES, OCCURRENCES);
  assert.deepEqual(created.map(entry => entry.day), ['2026-10-06', '2026-10-13']);
  assert.deepEqual(created.map(entry => entry.contentId), ['cnt-1', 'cnt-2']);
  assert.deepEqual(created.map(entry => entry.state), ['created', 'created']);

  // ادغام: مرتب بر پایهٔ روز و بدون تکرار شمارهٔ دوره؛ نسخهٔ ثبت‌شده بر محاسبه‌شده مقدم است.
  const merged = seriesCalendarEntries({
    series: SERIES,
    periods: [...PERIODS, { sequence: 1, periodKey: 'weekly-001', periodLabel: 'هفته ۱', startDate: '2026-10-06', deadline: '2026-10-10', publicationDate: '2026-10-06', publicationTime: '09:30' }],
    occurrences: OCCURRENCES,
  });
  assert.deepEqual(merged.map(entry => entry.day), ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
  assert.deepEqual(merged.map(entry => entry.state), ['created', 'created', 'planned', 'planned']);
  assert.equal(merged[0].key, 'created:ser-1:cnt-1');

  const grouped = groupSeriesCalendarEntries(merged);
  assert.deepEqual(Object.keys(grouped), ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
  assert.equal(grouped['2026-10-20'][0].sequence, 3);
});

test('series calendar rows list each series days inside the visible range only', () => {
  const other = { id: 'ser-2', name: 'مجموعهٔ ماهانه' };
  const entries = [
    ...seriesCalendarEntries({ series: SERIES, periods: PERIODS, occurrences: OCCURRENCES }),
    ...seriesCalendarEntries({ series: other, periods: [{ sequence: 1, periodLabel: 'مهر', title: 'ماهانه مهر', startDate: '2026-10-20', deadline: '2026-10-25', publicationDate: '2026-10-20', publicationTime: '11:00' }] }),
  ];
  const rows = seriesCalendarSeriesRows(entries, [SERIES, other, { id: 'ser-3', name: 'بدون روز' }], ['2026-10-06', '2026-10-07', '2026-10-13', '2026-10-20']);
  // مجموعه‌های بدون روز در بازه حذف می‌شوند تا فهرست، دادهٔ واقعی نشان دهد.
  assert.deepEqual(rows.map(row => row.seriesId), ['ser-1', 'ser-2']);
  assert.deepEqual(rows[0].entries.map(entry => entry.day), ['2026-10-06', '2026-10-13', '2026-10-20']);
  assert.deepEqual(rows[1].entries.map(entry => entry.day), ['2026-10-20']);
});

test('each series keeps one literal colour and the palette stays readable', () => {
  assert.ok(SERIES_CALENDAR_TONES.length >= 8);
  for (const tone of SERIES_CALENDAR_TONES) {
    assert.match(tone.dot, /^bg-\S+-500$/);
    assert.match(tone.chip, /^border-\S+-200 bg-\S+-50 text-\S+-\d00$/);
    assert.match(tone.accent, /^border-r-\S+-500$/);
    assert.match(tone.label, /^text-\S+-\d00$/);
  }
  assert.equal(seriesCalendarTone(0), SERIES_CALENDAR_TONES[0]);
  assert.equal(seriesCalendarTone(2).dot, 'bg-amber-500');
  // رنگ هر مجموعه با ترتیب فهرست تعیین می‌شود و برای تعداد بیشتر از پالت تکرار می‌شود.
  assert.equal(seriesCalendarTone(SERIES_CALENDAR_TONES.length), seriesCalendarTone(0));
  assert.equal(seriesCalendarTone(-1), SERIES_CALENDAR_TONES[SERIES_CALENDAR_TONES.length - 1]);
});

test('the content series page offers a calendar view fed by the existing server calculations', async () => {
  const [view, calendar, views, api, demo, demoIndex] = await Promise.all([
    source('../src/components/content/ContentSeriesView.tsx'),
    source('../src/components/content/SeriesCalendar.tsx'),
    source('../src/components/calendar/CalendarViews.tsx'),
    source('../src/api/series.ts'),
    source('../src/demo/seriesDemo.ts'),
    source('../src/demo/index.ts'),
  ]);

  // نما از نشانی صفحه خوانده و نوشته می‌شود (فهرست/کارتی/تقویمی).
  assert.match(view, /const viewParam = params\.get\('view'\)/);
  assert.match(view, /const viewMode: 'grid' \| 'calendar'/);
  assert.match(view, /aria-label="نمای تقویمی"/);
  assert.match(view, /aria-label="تقویم مجموعه‌های محتوا"/);

  // دادهٔ تقویم از همان سرویس‌های موجود می‌آید؛ هیچ محاسبهٔ دستی تکرار و هیچ مسیر تازه‌ای نیست.
  assert.match(view, /const SERIES_CALENDAR_PERIODS = 12;/);
  assert.match(view, /const reader = runtime\.demoMode \? seriesDemo : seriesApi;/);
  // برای مجموعهٔ غیرفعال پیش‌بینی گرفته نمی‌شود؛ فقط روزهای ثبت‌شده می‌مانند.
  assert.match(view, /const periods = row\.status === 'active' \? \(await reader\.schedule\(row\.id, SERIES_CALENDAR_PERIODS\)\)\.data : \[\];/);
  assert.match(view, /const SERIES_CALENDAR_OCCURRENCES = 6;/);
  assert.match(view, /row\.occurrenceCount > 0[\s\S]{0,140}reader\.occurrences\(row\.id, \{ per_page: SERIES_CALENDAR_OCCURRENCES \}\)/);
  assert.match(view, /enabled: !selectedId && viewMode === 'calendar' && listRows\.length > 0/);
  assert.doesNotMatch(view, /\brequest\(/);
  assert.doesNotMatch(api, /\/[a-z-]*calendar/);
  assert.doesNotMatch(view, /seriesApi\.\w*calendar/i);
  assert.doesNotMatch(view, /buildCalendarDays|startOfJalaliWeek|addMonths\(/);

  // تقویم هم در فهرست و هم در تب «تقویم آیندهٔ» جزئیات سوار می‌شود.
  assert.equal((view.match(/<SeriesCalendar\b/g) || []).length, 2);
  assert.match(view, /onOpenSeries=\{openDetail\}/);
  assert.match(view, /entries=\{\(calendar\.data \|\| \[\]\)\.flatMap\(item => seriesCalendarEntries\(item\)\)\}/);

  // دوره‌های گرفته‌شده از سرور هم تقویم و هم دستهٔ ثبت را پوشش می‌دهند (بدون اختلاف عدد).
  assert.match(view, /const schedulePeriods = Math\.max\(batchCount, SERIES_CALENDAR_PERIODS\);/);
  assert.match(view, /const batchPeriods = plannedPeriods\.slice\(0, batchCount\);/);
  assert.match(view, /\$\{batchPeriods\.length\.toLocaleString\('fa-IR'\)\} پروندهٔ محتوای مستقل از \$\{formatPersianDate\(batchPeriods\[0\]\?\.startDate\)\}/);

  // تقویم درشت و شفاف: همان تقویم مشترک سامانه با اندازهٔ بزرگ و بدون دادهٔ ساختگی.
  assert.match(calendar, /import \{[\s\S]*?CalendarGrid,[\s\S]*?CalendarRangeToolbar,[\s\S]*?\} from '\.\.\/calendar\/CalendarViews';/);
  assert.match(calendar, /size="large"/);
  assert.match(calendar, /seriesCalendarTone\(seriesOrder\.findIndex\(item => item\.id === seriesId\)\)/);
  assert.match(calendar, /aria-pressed=\{!off\}/);
  assert.match(calendar, /const MAX_VISIBLE_CHIPS = 3;/);
  assert.match(calendar, /<CalendarDayModal/);
  assert.match(calendar, /onSelectDay=\{setSelectedDay\}/);
  assert.match(calendar, /روزهای هر مجموعه در این بازه/);
  assert.doesNotMatch(calendar, /useApp\(|useQuery\(|18:00|'۱۰:۰۰'/);
  assert.match(calendar, /entries\.filter\(entry => !hidden\.has\(entry\.seriesId\)\)/);

  // دادهٔ نمایشی همان قرارداد خواندنی سرویس را پاسخ می‌دهد؛ نوشتن همچنان مسدود است.
  assert.match(demoIndex, /contentSeries: onlyDemo\(series\.INITIAL_CONTENT_SERIES\)/);
  assert.match(demo, /Pick<typeof seriesApi, 'list' \| 'workspaceSummary' \| 'get' \| 'preview' \| 'schedule' \| 'occurrences' \| 'itemSummary' \| 'revisions'>/);
  assert.match(demo, /schedule: async \(id, count = 6\)/);
  assert.match(demo, /export const INITIAL_CONTENT_SERIES: ContentSeries\[\] = SEEDS\.map\(seriesOf\);/);

  // اندازهٔ بزرگ فقط یک حالت از همان شبکه است؛ نمای پیش‌فرض سامانه تغییر نکرده است.
  assert.match(views, /size\?: 'comfortable' \| 'large';/);
  assert.match(views, /large \? 'min-h-\[164px\] p-2\.5 sm:min-h-\[208px\]' : 'min-h-\[128px\] p-2 sm:min-h-\[156px\]'/);
  assert.match(views, /const large = size === 'large';/);
});
