import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  addMinutesToClock,
  clockGapMinutes,
  durationMinutes,
  isIdeaOpen,
  isMeetingPending,
  meetingIsoDate,
  normalizeClock,
  openIdeaCount,
  parseGuests,
  pendingMeetingCount,
  readableGap,
} from '../src/utils/meetings.ts';
import { isReadyToPublish, publicationDisplayStatus, workflowReady } from '../src/utils/publicationReadiness.ts';
import { toIsoDateKey } from '../src/utils/isoDate.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('ساعت جلسه از ارقام فارسی و شکل‌های مختلف خوانده می‌شود', () => {
  assert.equal(normalizeClock('۱۰:۳۰'), '10:30');
  assert.equal(normalizeClock('9:05'), '09:05');
  assert.equal(normalizeClock('25:00'), '');
  assert.equal(normalizeClock(''), '');
  assert.equal(addMinutesToClock('10:30', 90), '12:00');
  assert.equal(addMinutesToClock('23:30', 60), '00:30');
  assert.equal(durationMinutes('۹۰ دقیقه'), 90);
  assert.equal(durationMinutes('۱ ساعت و ۳۰ دقیقه'), 90);
  assert.equal(durationMinutes('45'), 45);
  assert.equal(clockGapMinutes('10:00', '11:30'), 90);
  assert.equal(clockGapMinutes('11:30', '10:00') < 0, true);
  assert.equal(readableGap('10:00', '11:30'), '1 ساعت و 30 دقیقه');
  assert.equal(readableGap('10:00', '10:45'), '45 دقیقه');
});

test('مهمان‌ها تمیز، بی‌تکرار و با ویرگول/خط جدا می‌شوند', () => {
  assert.deepEqual(parseGuests(' دکتر احمدی، خانم کریمی ,  دکتر احمدی '), ['دکتر احمدی', 'خانم کریمی']);
  assert.deepEqual(parseGuests('یک\nدو'), ['یک', 'دو']);
  assert.deepEqual(parseGuests(''), []);
  assert.deepEqual(parseGuests(['a', 'a', ' ']), ['a']);
});

test('تاریخ جلسه از شمسی و میلادی به یک کلید قابل‌مقایسه تبدیل می‌شود', () => {
  assert.equal(meetingIsoDate('1405/06/15'), '2026-09-06');
  assert.equal(meetingIsoDate('۱۴۰۵/۰۶/۱۵'), '2026-09-06');
  assert.equal(meetingIsoDate('2026-09-06'), '2026-09-06');
  assert.equal(meetingIsoDate('2026-09-06T10:00:00'), '2026-09-06');
  assert.equal(meetingIsoDate(''), '');
  assert.equal(meetingIsoDate(null), '');
  assert.equal(meetingIsoDate('چیزی که تاریخ نیست'), '');
  assert.equal(toIsoDateKey('1404/01/01'), '2025-03-21');
});

test('شمارنده‌های تب فقط کارهای باز و جلسه‌های برگزارنشده را می‌شمارند', () => {
  assert.equal(isMeetingPending({ status: 'scheduled' }), true);
  assert.equal(isMeetingPending({ status: 'in_progress' }), true);
  assert.equal(isMeetingPending({}), true);
  assert.equal(isMeetingPending({ status: 'completed' }), false);
  assert.equal(isMeetingPending({ status: 'cancelled' }), false);
  assert.equal(pendingMeetingCount([{ status: 'scheduled' }, { status: 'completed' }, { status: 'cancelled' }, { status: 'in_progress' }]), 2);

  assert.equal(isIdeaOpen({ status: 'submitted' }), true);
  assert.equal(isIdeaOpen({ status: 'under_review' }), true);
  assert.equal(isIdeaOpen({}), true);
  assert.equal(isIdeaOpen({ status: 'completed' }), false);
  assert.equal(isIdeaOpen({ status: 'implemented' }), false);
  assert.equal(isIdeaOpen({ status: 'rejected' }), false);
  assert.equal(isIdeaOpen({ status: 'archived' }), false);
  assert.equal(openIdeaCount([{ status: 'submitted' }, { status: 'completed' }, { status: 'approved' }]), 2);
});

test('برچسب «آماده انتشار» برای پروندهٔ تمام‌شده هم ساخته می‌شود', () => {
  const doneStages = [{ status: 'approved' }, { status: 'completed' }, { status: 'skipped' }];
  assert.equal(workflowReady(doneStages), true);
  assert.equal(workflowReady([{ status: 'approved' }, { status: 'in_progress' }]), false);
  assert.equal(workflowReady([]), false);
  assert.equal(workflowReady(undefined), false);

  assert.equal(publicationDisplayStatus({ status: 'ready_to_publish' }), 'ready_to_publish');
  assert.equal(publicationDisplayStatus({ status: 'producing', stages: doneStages }), 'ready_to_publish');
  assert.equal(publicationDisplayStatus({ status: 'producing', stages: [{ status: 'in_progress' }] }), 'producing');
  assert.equal(publicationDisplayStatus({ status: 'published', stages: doneStages }), 'published');
  assert.equal(publicationDisplayStatus({ status: 'archived', stages: doneStages }), 'archived');
  assert.equal(isReadyToPublish({ status: 'published', stages: doneStages }), false);
  assert.equal(isReadyToPublish({ status: 'approved', stages: doneStages }), true);
});

test('تاریخ مهلت مرحلهٔ محتوا با کلیک همان‌جا قابل تغییر است', async () => {
  const view = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(view, /stageDeadlinePicker/);
  assert.match(view, /setStageDeadlinePicker/);
  // مسیر داده همان تابع مسئول مرحله است؛ هیچ ذخیره‌سازی موازی ساخته نشده.
  assert.match(view, /assignStageResponsibility\(content\.id, stage\.id, \{ deadline: date \}\)/);
  assert.match(view, /aria-label="انتخاب مهلت مرحله"/);
  assert.match(view, /<PersianDatePicker/);
});

test('پیوست‌های وظیفه در پنجرهٔ جزئیات نمایش داده نمی‌شوند', async () => {
  const drawer = await source('../src/components/tasks/TaskDetailDrawer.tsx');
  assert.doesNotMatch(drawer, /<TaskAssetsSection/);
  assert.doesNotMatch(drawer, /import \{ TaskAssetsSection \}/);
});

test('فهرست محتواهای منتشرشده فیلتر بازشو دارد', async () => {
  const view = await source('../src/components/content/ContentPublishedView.tsx');
  assert.match(view, /فیلتر محتواهای منتشرشده/);
  assert.match(view, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
  assert.match(view, /<Collapsible open=\{filtersOpen\}>/);
  assert.match(view, /<PersianDatePicker/);
  assert.match(view, /toIsoDateKey\(content\.publishInfo\?\.date\)/);
  assert.match(view, /filteredContents\.map/);
});

test('تب ایده‌ها و جلسات شمارندهٔ کارهای باز را نشان می‌دهد', async () => {
  const view = await source('../src/components/thought-room/ThoughtRoomMainView.tsx');
  assert.match(view, /openIdeaCount\(ideas\)/);
  assert.match(view, /pendingMeetingCount\(thinkTankMeetings\)/);
});

test('فیلتر جلسات بازهٔ تاریخ و نوع برگزاری دارد', async () => {
  const tab = await source('../src/components/thought-room/ThinkTankMeetingsTab.tsx');
  assert.match(tab, /const \[dateFrom, setDateFrom\] = useState\(''\)/);
  assert.match(tab, /const \[dateTo, setDateTo\] = useState\(''\)/);
  assert.match(tab, /const \[locationFilter, setLocationFilter\]/);
  assert.match(tab, /meetingIsoDate\(/);
  assert.match(tab, /value="in_person"/);
  assert.match(tab, /value="hybrid"/);
  assert.match(tab, /از تاریخ/);
  assert.match(tab, /تا تاریخ/);
});

test('صورت‌جلسه ساعت شروع/پایان و مهمان‌ها را می‌گیرد', async () => {
  const modal = await source('../src/components/thought-room/MeetingMinutesModal.tsx');
  assert.match(modal, /const \[startTime, setStartTime\]/);
  assert.match(modal, /const \[endTime, setEndTime\]/);
  assert.match(modal, /const \[guestsText, setGuestsText\]/);
  assert.match(modal, /parseGuests\(guestsText\)/);
  assert.match(modal, /clockGapMinutes\(startTime, endTime\) <= 0/);
  assert.match(modal, /type="time"/);
  assert.match(modal, /\{ startTime, endTime, guests: guestNames \}/);

  const context = await source('../src/context/AppContext.tsx');
  assert.match(context, /timing\?: \{ startTime\?: string; endTime\?: string; guests\?: string\[\] \}/);
  assert.match(context, /\.\.\.\(timing\?\.startTime \? \{ startTime: timing\.startTime \} : \{\}\)/);
});

test('تاریخ پیش‌فرض جلسه امروزِ محلی است، نه UTC', async () => {
  const modal = await source('../src/components/thought-room/CreateMeetingModal.tsx');
  assert.match(modal, /useState\(meeting\?\.date \|\| todayLocalISO\(\)\)/);
  assert.doesNotMatch(modal, /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/);
});

test('فیلتر وضعیت موارد مرتبط پروژه همان واژگان سرور را دارد', async () => {
  const view = await source('../src/components/projects/ProjectDetailView.tsx');
  assert.match(view, /\['under_review', 'در حال ارزیابی'\]/);
  assert.match(view, /\['implemented', 'پیاده‌سازی‌شده'\]/);
  assert.match(view, /\['in_progress', 'در حال برگزاری'\]/);
  // وضعیت‌های ناموجود در دیتابیس نباید در فهرست فیلتر بمانند.
  assert.doesNotMatch(view, /ideas:\s*\[[^\]]*'reviewing'/s);
  assert.doesNotMatch(view, /ideas:\s*\[[^\]]*'converted'/s);
});

test('زیر عنوان تسک، نام محتوا/پروژهٔ مرتبط می‌آید و بدون ارتباط هیچ خطی نیست', async () => {
  const view = await source('../src/components/tasks/MyTasksView.tsx');
  assert.match(view, /const linkedContent = task\.contentId \? contents\.find/);
  assert.match(view, /relatedLabel = linkedContent/);
  assert.match(view, /\{relatedLabel && <span className="mt-0\.5 block truncate text-\[10px\] font-bold text-slate-500">\{relatedLabel\}<\/span>\}/);
});

test('کارت خروجی محتوا در صفحهٔ عریض سه‌ستونه است', async () => {
  const sections = await source('../src/components/content/StageAssetSections.tsx');
  assert.match(sections, /lg:grid-cols-2 xl:grid-cols-3/);
});

test('نوار رنگی سربرگ محتوا هم‌رنگ رنگ اصلی و داخل کارت است', async () => {
  const view = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(view, /data-brand-band="primary"/);
  assert.match(view, /absolute inset-x-5 top-0 h-1 rounded-b-full bg-\[var\(--color-primary\)\]/);
});

test('موارد مرتبط پروژه فقط برای پروژهٔ ثبت‌شده روی سرور درخواست می‌شود', async () => {
  const view = await source('../src/components/projects/ProjectDetailView.tsx');
  assert.ok(view.includes('const serverProjectId = Boolean(project && /^\\d+$/.test(project.id));'));
  for (const domain of ['tasks', 'contents', 'series', 'activities', 'ideas', 'meetings']) {
    assert.match(view, new RegExp(`enabled: serverProjectId && tab === '${domain}' &&`));
  }
  assert.match(view, /شناسهٔ موقت/);
  // شمارندهٔ تب‌ها هم مثل فهرست، رکورد بایگانی‌شده را نمی‌شمارد (سمت سرور).
  const controller = await source('../../backend/app/Http/Controllers/Api/V1/ProjectOperationsController.php');
  assert.match(controller, /'ideas' => .*where\('status', '!=', 'archived'\)->count\(\)/);
  assert.match(controller, /'meetings' => .*where\('status', '!=', 'archived'\)->count\(\)/);
});

test('منابع رکورد فضای‌کار مسئول را برمی‌گردانند تا «بدون مسئول» جعلی نباشد', async () => {
  const resource = await source('../../backend/app/Http/Resources/WorkspaceRecordResource.php');
  assert.match(resource, /'ownerId' => \$this->owner_id !== null \? \(string\) \$this->owner_id : null,/);
});
