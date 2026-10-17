import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calendarDueInfo, calendarDueRelative, calendarDueTone, calendarTimeKey, calendarTimeLabel, sortCalendarEventsByTime } from '../src/utils/calendarTone.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

const TODAY = new Date(2026, 9, 17); // 2026-10-17

test('رنگ کارت تقویم از تاریخ سررسید می‌آید', () => {
  assert.equal(calendarDueTone('2026-10-16T00:00:00', { today: TODAY }), 'past');
  assert.equal(calendarDueTone('2026-10-17', { today: TODAY }), 'today');
  assert.equal(calendarDueTone('2026-10-20', { today: TODAY }), 'soon');
  assert.equal(calendarDueTone('2026-11-20', { today: TODAY }), 'later');
  assert.equal(calendarDueTone(undefined, { today: TODAY }), 'unknown');
  assert.equal(calendarDueTone('not-a-date', { today: TODAY }), 'unknown');
  // کار تعیین‌تکلیف‌شده رنگ خنثای سبز می‌گیرد، حتی اگر تاریخش گذشته باشد.
  assert.equal(calendarDueTone('2026-01-01', { today: TODAY, settled: true }), 'settled');

  assert.deepEqual(calendarDueInfo('2026-10-14', { today: TODAY }), { tone: 'past', days: -3 });
  assert.deepEqual(calendarDueInfo('2026-10-20', { today: TODAY, soonDays: 3 }), { tone: 'soon', days: 3 });
  assert.deepEqual(calendarDueInfo('2026-10-21', { today: TODAY, soonDays: 3 }), { tone: 'later', days: 4 });
  assert.equal(calendarDueRelative({ tone: 'past', days: -3 }), '۳ روز گذشته');
  assert.equal(calendarDueRelative({ tone: 'today', days: 0 }), 'امروز');
  assert.equal(calendarDueRelative({ tone: 'soon', days: 4 }), '۴ روز مانده');
  assert.equal(calendarDueRelative({ tone: 'unknown', days: null }), '');
});

test('کارت‌های هر روز به ترتیب ساعت مرتب می‌شوند و بدون‌ساعت‌ها آخر می‌آیند', () => {
  assert.equal(calendarTimeKey('2026-10-17T09:30:00'), '09:30');
  assert.equal(calendarTimeKey('09:05'), '09:05');
  assert.equal(calendarTimeKey(undefined), '99:99');
  assert.equal(calendarTimeLabel('2026-10-17 18:00:00'), '18:00');
  assert.equal(calendarTimeLabel('2026-10-17'), '');

  const rows = [
    { id: 'afternoon', at: '2026-10-17T16:00:00' },
    { id: 'all-day', at: '2026-10-17' },
    { id: 'morning', at: '2026-10-17T08:15:00' },
    { id: 'same-time', at: '2026-10-17T16:00:00' },
  ];
  assert.deepEqual(
    sortCalendarEventsByTime(rows, row => row.at).map(row => row.id),
    ['morning', 'afternoon', 'same-time', 'all-day'],
  );
  assert.deepEqual(sortCalendarEventsByTime([], () => null), []);
});

test('کارت مشترک تقویم عنوان کامل، وضعیت رنگی و رنگ سررسید دارد', async () => {
  const [card, tones, views] = await Promise.all([
    source('../src/components/calendar/CalendarEventCard.tsx'),
    source('../src/utils/calendarTone.ts'),
    source('../src/components/calendar/CalendarViews.tsx'),
  ]);
  // عنوان بریده نمی‌شود؛ چیدمان کارت با شکستن خط بزرگ می‌شود.
  assert.ok(card.includes('whitespace-normal break-words text-right font-black text-slate-900'));
  assert.doesNotMatch(card, /truncate\">\{title\}/);
  // وضعیت یک نشانگر رنگی است که رنگش از تنظیمات واقعی همان ماژول می‌آید.
  assert.ok(card.includes('CalendarStatusPill'));
  assert.ok(card.includes('backgroundColor: `${color}16`'));
  // رنگ کارت از ردهٔ سررسید می‌آید و رده‌ها یک منبع دارند.
  assert.ok(card.includes('CALENDAR_DUE_CARD[tone]'));
  assert.ok(tones.includes("past: 'border-violet-300 bg-violet-50/80'"));
  assert.ok(tones.includes("today: 'border-rose-300 bg-rose-50/80'"));
  assert.ok(tones.includes("soon: 'border-amber-300 bg-amber-50/80'"));

  // خانه‌های ماهانه بزرگ‌تر شده‌اند تا عنوان و وضعیت جا شوند.
  assert.ok(views.includes("large ? 'min-h-[164px] p-2.5 sm:min-h-[208px]' : 'min-h-[128px] p-2 sm:min-h-[156px]'"));
  assert.ok(views.includes('جزئیات روز'));
});

test('نمای هفتگی و سه‌هفتگی فهرست روزها با کارت‌های مرتب‌شده است', async () => {
  const views = await source('../src/components/calendar/CalendarViews.tsx');
  // هفت ستون باریک جای خود را به فهرست عمودی روزها داده است؛ روز = بخش با عنوان.
  assert.ok(views.includes('aria-label="روزهای بازه به ترتیب زمان"'));
  assert.ok(views.includes('<section'));
  assert.ok(views.includes('<header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100/80 pb-2">'));
  assert.ok(views.includes('agendaHint'));
  // نمای ماهانه همچنان شبکه‌ای است و کلیک روی روز مدال باز می‌کند.
  assert.ok(views.includes('grid min-w-[52rem] grid-cols-7 gap-1.5'));
  assert.ok(views.includes('onClick={onSelectDay ? () => onSelectDay(day) : undefined}'));
});

test('همهٔ تقویم‌ها پنجرهٔ «جزئیات روز» دارند و روزشان کلیک‌شدنی است', async () => {
  const calendars = await Promise.all([
    source('../src/components/projects/ProjectCalendarView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
    source('../src/components/content/SeriesCalendar.tsx'),
    source('../src/components/tasks/MyTasksView.tsx'),
    source('../src/components/workspace/WorkspaceList.tsx'),
  ]);
  for (const file of calendars) {
    assert.ok(file.includes('CalendarDayModal'));
    assert.ok(file.includes('onSelectDay='));
  }
  const [project, publishing, series, myTasks, workspace, modal] = await Promise.all([
    source('../src/components/projects/ProjectCalendarView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
    source('../src/components/content/SeriesCalendar.tsx'),
    source('../src/components/tasks/MyTasksView.tsx'),
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/calendar/CalendarDayModal.tsx'),
  ]);
  // محتوای هر تقویم کارت‌های همان روز را به ترتیب ساعت و با جزئیات بیشتر نشان می‌دهد.
  assert.ok(publishing.includes('sortCalendarEventsByTime<PublicationCalendarEntry>'));
  // موارد منتشرشده در همان روز جمع می‌شوند؛ داده و ترتیب ساعت دست‌نخورده است.
  assert.ok(publishing.includes('<CalendarSettledGroup count={published.length} label="منتشرشده">'));
  assert.ok(series.includes('sortCalendarEventsByTime<SeriesCalendarEntry>'));
  assert.ok(myTasks.includes('sortCalendarEventsByTime<Task>'));
  assert.ok(workspace.includes('sortCalendarEventsByTime<Task>'));
  assert.ok(project.includes('sortCalendarEventsByTime('));
  assert.ok(modal.includes('روز') && modal.includes('مورد'));
});
