import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PUBLICATION_TONE_CLASSES,
  isPublishedContent,
  publicationMoment,
  publicationRemaining,
  sortByPublicationMoment,
} from '../src/utils/publicationTiming.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

// لحظهٔ مرجع ثابت تا آزمون به ساعت اجرا وابسته نباشد.
const NOW = new Date(2026, 9, 16, 10, 0, 0);

test('publication countdown reports days and hours for publications and days only for a date', () => {
  // فقط تاریخ: محاسبهٔ روزمحور؛ «امروز» هرگز «گذشته» شمرده نمی‌شود.
  // نوبت ۱۷: ≤۱ روز قرمز (today)، ≤۴ روز زرد (soon)، گذشته بنفش (past)
  assert.deepEqual(publicationRemaining({ date: '2026-10-16' }, { now: NOW }), {
    tone: 'today', days: 0, hours: 0, overdue: false, hasTime: false, label: 'امروز',
  });
  assert.deepEqual(publicationRemaining({ date: '2026-10-17' }, { now: NOW }), {
    tone: 'today', days: 1, hours: 0, overdue: false, hasTime: false, label: '۱ روز مانده',
  });
  assert.equal(publicationRemaining({ date: '2026-10-18' }, { now: NOW })?.tone, 'soon');
  assert.equal(publicationRemaining({ date: '2026-10-20' }, { now: NOW })?.tone, 'soon');
  assert.equal(publicationRemaining({ date: '2026-10-21' }, { now: NOW })?.tone, 'later');
  assert.equal(publicationRemaining({ date: '2026-10-21' }, { now: NOW })?.label, '۵ روز مانده');
  assert.equal(publicationRemaining({ date: '2026-10-15' }, { now: NOW })?.label, '۱ روز گذشته');
  assert.equal(publicationRemaining({ date: '2026-10-15' }, { now: NOW })?.tone, 'past');

  // با ساعت ثبت‌شده: روز و ساعت با هم، هم برای انتشارهای آینده و هم گذشته.
  const future = publicationRemaining({ date: '2026-10-19', time: '15:00' }, { now: NOW });
  assert.equal(future?.label, '۳ روز و ۵ ساعت مانده');
  assert.equal(future?.days, 3);
  assert.equal(future?.hours, 5);
  assert.equal(publicationRemaining({ date: '2026-10-16', time: '18:00' }, { now: NOW })?.label, '۸ ساعت مانده');
  assert.equal(publicationRemaining({ date: '2026-10-16', time: '08:00' }, { now: NOW })?.label, '۲ ساعت گذشته');
  assert.equal(publicationRemaining({ date: '2026-10-16', time: '08:00' }, { now: NOW })?.tone, 'past');

  // منتشرشده و بدون تاریخ: بدون هیچ عدد یا تاریخ ساختگی.
  assert.equal(publicationRemaining({ date: '2026-10-01', time: '12:00', status: 'published' }, { now: NOW })?.label, 'منتشر شده است');
  assert.equal(publicationRemaining({ date: '2026-10-01', time: '12:00', status: 'published' }, { now: NOW })?.tone, 'published');
  assert.equal(publicationRemaining(undefined, { now: NOW }), null);
  assert.equal(publicationRemaining({ date: 'بدون تاریخ' }, { now: NOW }), null);
  assert.equal(publicationMoment({ date: '2026-10-16' })?.hasTime, false);
  assert.equal(publicationMoment({ date: '2026-10-16', time: '8:5' })?.time, '08:05');
  assert.equal(publicationMoment({ date: '2026-10-16' })?.iso, '2026-10-16');
  assert.deepEqual([isPublishedContent({ status: 'published' }), isPublishedContent({ publishInfo: { status: 'published' } }), isPublishedContent({ status: 'idea' })], [true, true, false]);

  // هر رده یک رنگ و زمینهٔ مشخص دارد (متن + زمینه).
  for (const tone of ['published', 'past', 'today', 'soon', 'later', 'unknown']) {
    assert.match(PUBLICATION_TONE_CLASSES[tone], /^border-\S+ bg-\S+ text-\S+$/);
  }
});

test('publication order is always by publication date', () => {
  const items = [
    { id: 'no-date' },
    { id: 'published-old', status: 'published', publishInfo: { date: '2026-09-01' } },
    { id: 'upcoming-later', publishInfo: { date: '2026-11-01' } },
    { id: 'upcoming-near', publishInfo: { date: '2026-10-17', time: '09:30' } },
    { id: 'published-new', publishInfo: { date: '2026-10-10', status: 'published' } },
  ];
  const sorted = sortByPublicationMoment(items, item => ({
    date: item.publishInfo?.date,
    time: item.publishInfo?.time,
    published: isPublishedContent(item),
  })).map(item => item.id);
  // زمان‌بندی‌شده‌ها از نزدیک‌ترین، منتشرشده‌ها از تازه‌ترین، بدون‌تاریخ‌ها در پایان.
  assert.deepEqual(sorted, ['upcoming-near', 'upcoming-later', 'published-new', 'published-old', 'no-date']);
  // ورودی دست‌نخورده می‌ماند؛ مرتب‌سازی کپی برمی‌گرداند.
  assert.equal(items[0].id, 'no-date');
});

test('content list shows the publisher, the publication date and its tone on every screen', async () => {
  const [workspace, mainView, chip] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/content/ContentMainView.tsx'),
    source('../src/components/common/PublicationDateChip.tsx'),
  ]);

  // نام «منتشرکننده» جای نام «مالک» در فهرست سامانه.
  assert.match(workspace, /module === 'projects' \? 'مدیر پروژه' : 'منتشرکننده'/);
  assert.match(workspace, /module === 'projects' \? row\.projectManagerId : module === 'tasks' \? row\.assigneeId : row\.publisherId/);
  assert.match(workspace, /module === 'contents' && <th className="p-4">تاریخ انتشار<\/th>/);
  assert.match(workspace, /module === 'contents' && <td className="p-4"><PublicationDateChip content=\{row\} \/><\/td>/);
  assert.match(workspace, /<PublicationDateChip content=\{row\} \/>/);
  assert.equal(workspace.match(/<PublicationDateChip content=\{row\} \/>/g)?.length, 2, 'نشان انتشار در نمای فهرست و کارت');

  // فهرست نمایشی هم همان نشان مشترک را می‌خواند (بدون تاریخ و ساعت ساختگی).
  assert.match(mainView, /<PublicationDateChip content=\{content\} \/>/);
  assert.match(mainView, /const publisherOf = \(content: Content\) => users\.find\(u => u\.id === content\.publisherId\)/);
  assert.match(mainView, /منتشرکننده/);
  assert.doesNotMatch(mainView, /content\.publishInfo\.time \? ` · ساعت/);

  // قرارداد مشترک رنگ و شمارش معکوس.
  assert.match(chip, /publicationRemaining\(content\.publishInfo, \{ published: isPublishedContent\(content\) \}\)/);
  assert.match(chip, /PUBLICATION_TONE_CLASSES\[remaining\.tone\]/);
  assert.match(chip, /انتشار تعیین نشده/);
  assert.match(chip, /formatPersianTime\(content\.publishInfo\.time\)/);
});

test('the content list offers the shared publication calendar on real rows', async () => {
  const [workspace, mainView, calendar] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/content/ContentMainView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
  ]);

  // نمای تقویم انتشار در فهرست محتوا (سامانه و نمایشی) از همان کامپوننت مشترک.
  assert.match(workspace, /\? \(requestedView === 'cards' \|\| requestedView === 'calendar' \? requestedView : 'list'\)/);
  assert.match(workspace, /<CalendarClock className="w-3\.5 h-3\.5" \/>تقویم انتشار/);
  assert.match(workspace, /module === 'contents' && view === 'calendar' \? \(/);
  assert.match(workspace, /<PublishingCalendar\s*\n\s*contents=\{rows as any\[\]\}/);
  assert.match(workspace, /onSelectContent=\{id => navigate\(detail\(id\)\)\}/);
  assert.match(mainView, /<PublishingCalendar\s*\n\s*contents=\{orderedContents\}/);
  assert.match(mainView, /onSelectContent=\{handleOpenContent\}/);
  // ریاضیات دست‌ساز ماه جلالی از فهرست نمایشی هم حذف شده است.
  assert.doesNotMatch(mainView, /calendarCells|getDaysInJalaliMonth|PERSIAN_MONTH_NAMES/);

  // تقویم، دادهٔ خود را از بیرون می‌گیرد و تاریخ انتشار واقعی را تطبیق می‌دهد.
  assert.match(calendar, /export interface PublicationCalendarEntry/);
  assert.match(calendar, /contents: PublicationCalendarEntry\[\]/);
  assert.match(calendar, /String\(content\.publishInfo\?\.date \|\| ''\)\.slice\(0, 10\) === iso/);
  assert.match(calendar, /PUBLICATION_SURFACE_TONE_CLASSES\[remaining\?\.tone \?\? 'unknown'\]/);
  // تقویم انتشار هم پنجرهٔ «جزئیات روز» و کارت رنگی بر پایهٔ تاریخ انتشار دارد.
  assert.match(calendar, /<CalendarDayModal/);
  // نوبت ۱۷: موارد منتشرشده دیگر جمع‌شده نمایش داده نمی‌شوند — همهٔ کارت‌ها مستقیم رندر می‌شوند.
  assert.doesNotMatch(calendar, /CalendarSettledGroup/);
  assert.match(calendar, /const \{ users \} = useApp\(\)/);
});

test('content detail counts down the final deadline in days and the publication in days and hours', async () => {
  const [detail, dates] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/utils/date.ts'),
  ]);

  // موعد نهایی: همیشه تعداد روز (بدون ساعت).
  assert.match(dates, /export const deadlineDaysLabel = \(state: DeadlineState\): string =>\s*\n\s*deadlineRelativeLabel\(state\) \|\|/);
  assert.match(detail, /const contentDeadlineLabel = contentFinished \? '' : deadlineDaysLabel\(contentDeadlineState\)/);
  assert.match(detail, /\{contentDeadlineLabel && <p className=\{`mt-1 text-\[9px\] font-black \$\{contentDeadlineTextTone\}`\}>/);

  // تاریخ انتشار: روز و ساعت، با رنگ و زمینهٔ همان رده.
  assert.match(detail, /const publicationState = publicationRemaining\(content\.publishInfo, \{ published: isPublished \}\)/);
  assert.match(detail, /const publicationBoxTone = PUBLICATION_SURFACE_TONE_CLASSES\[publicationState\?\.tone \?\? 'unknown'\]/);
  assert.match(detail, /className=\{`rounded-2xl border p-3 \$\{publicationBoxTone\}`\}/);
  assert.match(detail, /\{publicationState && <p className=\{`mt-1 text-\[9px\] font-black \$\{publicationTextTone\}`\}>\{publicationState\.label\}/);
  assert.match(detail, /const isPublished = isPublishedContent\(content\)/);
});

test('the publishing desk always sorts by publication date and names the real publisher', async () => {
  const [desk, calendar] = await Promise.all([
    source('../src/components/content/ContentPublishingView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
  ]);

  assert.match(desk, /const orderedContents = sortByPublicationMoment\(filteredContents, publicationOrder\)/);
  assert.match(desk, /const orderedChannelContents = \(channelId: string\) => sortByPublicationMoment\(/);
  assert.match(desk, /const channelContents = orderedChannelContents\(chKey\)/);
  assert.equal(desk.match(/orderedContents\.map\(c => \{/g)?.length, 2, 'گاه‌شمار و جدول انتشار');
  assert.ok(desk.includes('ترتیب همیشه بر اساس تاریخ انتشار'));
  assert.match(desk, /const publishedList = contents\.filter\(isPublishedContent\)/);
  assert.match(desk, /const publisher = users\.find\(u => u\.id === c\.publisherId\)/);
  // نوبت ۱۷: تقویم انتشار هم فقط محتواهای منتشرنشده/آرشیونشده را نشان می‌دهد
  assert.match(desk, /<PublishingCalendar\s*\n\s*contents=\{filteredContents\}/);
  // هیچ ساعت یا کانال ساختگی نمایش داده نمی‌شود.
  assert.doesNotMatch(desk, /'۱۸:۰۰'/);
  assert.doesNotMatch(desk, /\|\| \['website'\]/);
});
