import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('dependent stage tasks are not created before their prerequisite finishes', async () => {
  const [sync, dependencies, operations, tests] = await Promise.all([
    source('../../backend/app/Services/ContentStageTaskSync.php'),
    source('../../backend/app/Support/Content/StageDependencies.php'),
    source('../../backend/app/Services/TaskOperations.php'),
    source('../../backend/tests/Feature/ContentWorkflowPolicyTest.php'),
  ]);

  // یک منبع حقیقت برای وضعیت‌های تمام‌شده و یک دروازهٔ صریح پیش از ساخت تسک.
  assert.match(sync, /private const FINISHED_STAGE_STATUSES = StageDependencies::FINISHED_STATUSES;/);
  assert.match(sync, /\$blockingReason = StageDependencies::blockingReason\(\$stages, \$stageId\);/);
  assert.match(sync, /if \(\$blockingReason !== null\) \{\s*\$this->markBlocked\(\$content->id, \$stageId, \$blockingReason\);\s*continue;/s);
  // پیش‌نیاز از سه منبع واقعی همان جریان خوانده می‌شود، نه از یک حدس محلی، و
  // یک کلاس مشترک هم ساخت تسک و هم پیش‌بردن مرحله را هدایت می‌کند.
  assert.match(dependencies, /public static function blockingReason\(array \$stages, string \$stageId\): \?string/);
  assert.match(dependencies, /public const FINISHED_STATUSES = \['approved', 'completed', 'skipped'\];/);
  assert.match(dependencies, /\$stage\['dependsOnStageIds'\]/);
  assert.match(dependencies, /\$input\['sourceStageId'\]/);
  assert.match(dependencies, /return \$status === 'pending_dependency' \? 'این مرحله هنوز فعال نشده است\.' : null;/);
  assert.match(operations, /StageDependencies::blockingReason\(\$stages, \(string\) \$task->content_stage_id\) !== null/);
  // ردیف‌های قدیمی حذف نمی‌شوند؛ «مسدود» علامت می‌خورند و با بازشدن پاک می‌شوند.
  assert.match(sync, /'is_blocked' => true,/);
  assert.match(sync, /'blocked_reason' => \$reason,/);
  assert.match(sync, /private function clearBlocked\(Task \$task\): void/);
  assert.match(sync, /\$this->clearBlocked\(\$workTask\);/);
  // نخستین مرحلهٔ جریان هرگز قفل نمی‌شود.
  assert.match(dependencies, /نخستین مرحلهٔ جریان پیش‌نیازی ندارد/);

  // آزمون‌های رفتاری همین قرارداد در مجموعهٔ بک‌اند.
  assert.match(tests, /test_dependent_stage_task_is_created_only_after_its_prerequisite_finishes/);
  assert.match(tests, /test_legacy_task_of_a_dependent_stage_is_marked_blocked_instead_of_deleted/);
  assert.match(tests, /test_completing_a_blocked_stage_task_never_advances_the_dependent_stage/);
  assert.match(tests, /\$this->assertSame\(0, Task::where\('content_id', \$content->id\)->where\('content_stage_id', 'two'\)->count\(\)\);/);
});

test('both detail pages place the back control and the page title on one line', async () => {
  const [detail, series] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/ContentSeriesView.tsx'),
  ]);

  assert.match(detail, /<div className="flex items-center gap-3">\s*<button type="button" onClick=\{goBack\}[\s\S]{0,400}<h1 className="min-w-0 flex-1 break-words text-xl font-black tracking-tight text-slate-950 sm:text-3xl">\{content\.title\}<\/h1>/);
  assert.match(series, /<div className="flex items-center gap-3">\s*<IconButton label="بازگشت به مجموعه‌ها"[\s\S]{0,400}<h1 className="min-w-0 flex-1 break-words text-xl font-black tracking-tight text-slate-950 sm:text-3xl">\{selected\.name\}<\/h1>/);
  // عنوان نباید در ردیف جداگانه با فاصلهٔ بالا بیاید؛ منبع بازگشت هم همان دکمهٔ آیکنی است.
  assert.doesNotMatch(detail, /<h1 className="mt-3 break-words/);
  assert.doesNotMatch(series, /<h1 className="mt-3 break-words/);
  assert.match(detail, /ui-icon-button-back/);
  assert.match(series, /label="بازگشت به مجموعه‌ها"/);
});

test('the shared calendar offers month, week and three-week ranges with a mobile-friendly layout', async () => {
  const [views, project, publishing] = await Promise.all([
    source('../src/components/calendar/CalendarViews.tsx'),
    source('../src/components/projects/ProjectCalendarView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
  ]);

  assert.match(views, /export type CalendarRangeMode = 'month' \| 'week' \| 'threeWeeks';/);
  for (const label of ['ماهانه', 'هفتگی', 'سه‌هفتگی']) assert.ok(views.includes(label), label);
  assert.match(views, /export function buildCalendarDays\(anchor: Date, mode: CalendarRangeMode\)/);
  assert.match(views, /const length = mode === 'week' \? 7 : 21;/);
  assert.match(views, /return addDays\(anchor, \(mode === 'week' \? 7 : 21\) \* direction\);/);
  assert.match(views, /export function calendarRangeLabel\(anchor: Date, mode: CalendarRangeMode\)/);
  // موبایل: نمای ماهانه اسکرول افقی با ستون‌های کمینه‌عرض؛ هفتگی و سه‌هفتگی
  // دیگر هفت ستون باریک نیستند و فهرست عمودی روزها با کارت‌های درشت‌اند.
  assert.match(views, /overflow-x-auto px-1 pb-1/);
  assert.match(views, /min-w-\[52rem\] grid-cols-7/);
  assert.match(views, /aria-label="روزهای بازه به ترتیب زمان"/);
  assert.match(views, /جزئیات روز/);
  // شمارهٔ روز خودش دکمهٔ «جزئیات روز» است و کلیک روی بدنهٔ روز هم همان را باز می‌کند.
  assert.ok(views.includes('onClick={onSelectDay ? () => onSelectDay(day) : undefined}'));
  assert.ok(views.includes('onSelectDay?.()'));

  // هر دو تقویم سامانه از همان نوار و همان شبکه استفاده می‌کنند.
  for (const calendar of [project, publishing]) {
    assert.match(calendar, /CalendarRangeToolbar/);
    assert.match(calendar, /<CalendarGrid/);
    assert.match(calendar, /buildCalendarDays\(anchor, rangeMode\)/);
    assert.match(calendar, /shiftCalendarAnchor\(previous, rangeMode, direction\)/);
  }
  // تطبیق رویداد با تاریخ تقویمی همان روز (بدون لغزش منطقهٔ زمانی).
  assert.match(project, /String\(event\.date\)\.slice\(0, 10\) === iso/);
  assert.match(publishing, /String\(content\.publishInfo\?\.date \|\| ''\)\.slice\(0, 10\) === iso/);
  // ریاضیات دست‌ساز ماه جلالی از تقویم انتشار حذف شده است.
  assert.doesNotMatch(publishing, /getDaysInJalaliMonth|iranOffset|calendarCells/);
  assert.doesNotMatch(project, /firstDayIndex|daysInMonth/);
});

test('content detail exposes the requested tabs including the new content-flow tab', async () => {
  const [detail, panel] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/ContentFlowPanel.tsx'),
  ]);

  for (const label of ['جریان‌های محتوا', 'تنظیمات انتشار', 'تسک‌های مربوط', 'فایل‌های مربوط', 'سناریو و اهداف رسانه‌ای', 'گفت‌وگوها']) {
    assert.ok(detail.includes(label), label);
  }
  for (const id of ["'process'", "'flows'", "'info'", "'attachments'", "'publish'", "'tasks'", "'comments'"]) {
    assert.match(detail, new RegExp(`id: ${id}`));
  }
  // تب‌ها روی موبایل در شبکه می‌آیند تا هیچ تبی بیرون از قاب پنهان نماند.
  assert.match(detail, /<div className="grid grid-cols-2 gap-1\.5 sm:grid-cols-3 xl:flex xl:flex-wrap">/);
  assert.doesNotMatch(detail, /min-w-max gap-1\.5/);
  assert.match(detail, /<ContentFlowPanel/);
  assert.match(detail, /stageTasks=\{flowStageTasks\}/);

  // پنل جریان: پیش‌نیاز واقعی هر مرحله، تسک ساخته‌شده و جریان‌های قابل اعمال.
  assert.match(panel, /stageWaitingReason\(stages, stage\)/);
  assert.match(panel, /TaskStatusBadge/);
  assert.match(panel, /تسک هر مرحله فقط پس از اتمام پیش‌نیاز همان مرحله ساخته می‌شود/);
  assert.match(panel, /تسک اجرا ساخته نشده است؛ با اتمام پیش‌نیاز همین مرحله ساخته می‌شود\./);
  assert.match(panel, /تسک اجرا ساخته نشده است؛ با فعال‌شدن همین مرحله ساخته می‌شود\./);
  assert.match(panel, /flowsForContentType\(templates, content\.type\)/);
  assert.match(panel, /activeFlowTemplate\(content\.processTemplateId, templates\)/);
  assert.match(panel, /اعمال این جریان روی پرونده/);
  assert.match(panel, /مدیریت جریان‌ها در تنظیمات سامانه/);
});

test('applying a flow rebuilds stages through the shared builder and stays behind real guards', async () => {
  const [detail, flow] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/utils/contentWorkflow.ts'),
  ]);

  assert.match(flow, /export function buildStagesFromTemplate\(/);
  assert.match(flow, /export const departmentMembers = \(/);
  assert.match(detail, /const nextStages = buildStagesFromTemplate\(template, \{/);
  assert.match(detail, /await updateContent\(content\.id, \{ processTemplateId: template\.id, stages: nextStages \}\)/);
  // اعمال جریان فقط روی پروندهٔ شروع‌نشده مجاز است.
  assert.match(detail, /if \(flowHasStarted\(stages\)\) \{/);
  assert.match(detail, /flowHasStarted/);
  assert.match(flow, /export const flowHasStarted = \(stages\?: ContentStage\[\] \| null\): boolean =>/);
});
