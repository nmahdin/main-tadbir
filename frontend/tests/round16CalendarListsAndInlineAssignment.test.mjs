import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isPublishedContent, publicationMoment, sortByPublicationMoment } from '../src/utils/publicationTiming.ts';

/**
 * نوبت شانزدهم: جمع‌شدن موارد انجام‌شده در تقویم، کارت‌های سبک‌تر، مدال روز
 * بدون مدال تودرتو با نام مسئول، ترتیب انتشار در فهرست محتوا، حذف توضیح زیر
 * عنوان تب‌ها، دکمهٔ کپی کپشن، سربرگ بزرگ‌تر ورودی/خروجی و تغییر مستقیم
 * مسئول/ارزیاب مرحله بدون بازکردن پنجرهٔ ویرایش جریان.
 *
 * این آزمون‌ها متن‌کد را می‌خوانند (مثل بقیهٔ tests/*.mjs)؛ رفتار خالص ترتیب
 * انتشار هم مستقیم از `utils/contentOrder.ts` سنجیده می‌شود.
 */

const source = path => readFile(new URL(path, import.meta.url), 'utf8');
const backend = path => source(`../../backend/${path}`);

test('ترتیب انتشار: زمان‌بندی‌شده‌ها از نزدیک‌ترین، منتشرشده‌ها از تازه‌ترین، بدون‌تاریخ در پایان', () => {
  const rows = [
    { id: 'published-old', status: 'published', publishInfo: { date: '2025-12-01' } },
    { id: 'scheduled-far', status: 'producing', publishInfo: { date: '2026-03-04' } },
    { id: 'no-date', status: 'draft' },
    { id: 'published-new', status: 'published', publishInfo: { date: '2026-03-04' } },
    { id: 'scheduled-near', status: 'ready_to_publish', publishInfo: { date: '2026-01-02' } },
  ];
  const before = rows.map(row => row.id);
  const sorted = sortByPublicationMoment(rows, row => ({
    date: row.publishInfo?.date,
    time: row.publishInfo?.time,
    published: isPublishedContent(row),
  })).map(row => row.id);
  assert.deepEqual(sorted, ['scheduled-near', 'scheduled-far', 'published-new', 'published-old', 'no-date']);
  assert.deepEqual(rows.map(row => row.id), before, 'آرایهٔ ورودی دست‌نخورده می‌ماند');
  assert.equal(publicationMoment({ date: '2026-03-04', time: '18:00' })?.moment.getHours(), 18);
});

test('فهرست اصلی محتوا و «محتوای منتشرشده» هر دو بر پایهٔ تاریخ واقعی انتشار مرتب می‌شوند', async () => {
  const [workspace, publishedView, listQuery, controller] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/content/ContentPublishedView.tsx'),
    source('../src/routing/listQuery.ts'),
    backend('app/Http/Controllers/Api/V1/ContentController.php'),
  ]);
  // فهرست اصلی مرتب‌سازی تاریخ انتشار را به درخواست سرور می‌سپارد.
  assert.match(workspace, /const defaultSort = module === 'contents' \? CONTENT_DEFAULT_SORT : 'created_at'/);
  assert.match(workspace, /const query = useWorkspacePage\(module, \{ \.\.\.filters, \.\.\.\(module === 'contents' \? \{ active_only: 1 \} : \{\}\), sort: filters\.sort \|\| defaultSort/);
  assert.match(publishedView, /const publishedContents = sortByPublicationMoment<Content>\(/);
  assert.match(publishedView, /content\.status === 'published'/);
  assert.match(listQuery, /export const CONTENT_DEFAULT_SORT = 'publish_at';/);
  assert.match(controller, /->when\(\$request->input\('sort'\) === 'publish_at', fn \(\$query\) => \$query->orderBy\(/);
});

test('کارت تقویم نقطهٔ رنگی، زمان باقی‌مانده و متن نوع را نشان نمی‌دهد', async () => {
  const [card, projectCalendar, publishingCalendar, tasksCalendar, workspaceCalendar] = await Promise.all([
    source('../src/components/calendar/CalendarEventCard.tsx'),
    source('../src/components/projects/ProjectCalendarView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
    source('../src/components/tasks/MyTasksView.tsx'),
    source('../src/components/workspace/WorkspaceList.tsx'),
  ]);
  // نشانگرهای حذف‌شده دیگر در کارت رندر نمی‌شوند؛ رنگ حاشیه معنا را می‌رساند.
  assert.doesNotMatch(card, /CALENDAR_DUE_DOT/);
  assert.doesNotMatch(card, /CALENDAR_DUE_LABEL/);
  assert.doesNotMatch(card, /dueLabel/);
  assert.doesNotMatch(card, /rounded-full \$\{CALENDAR_DUE_DOT/);
  // عنوان کامل و نشانگر وضعیت رنگی سرجایشان‌اند.
  assert.ok(card.includes('whitespace-normal break-words text-right font-black text-slate-900'));
  assert.ok(card.includes('CalendarStatusPill'));
  // هیچ تقویمی دیگر متن «چند روز مانده» را به کارت پاس نمی‌دهد و متن نوع هم حذف شده است.
  for (const file of [projectCalendar, publishingCalendar, tasksCalendar, workspaceCalendar]) {
    assert.doesNotMatch(file, /dueLabel=/);
  }
  assert.doesNotMatch(projectCalendar, /subtitle: 'تسک'/);
  assert.doesNotMatch(projectCalendar, /subtitle: 'موعد تحویل محتوا'/);
  assert.doesNotMatch(projectCalendar, /subtitle: 'زمان انتشار محتوا'/);
});

test('موارد انجام‌شده در همهٔ تقویم‌ها جمع‌شده نمایش داده می‌شوند', async () => {
  // نوبت ۱۷: دیگر جمع‌شده نمایش داده نمی‌شوند — همهٔ رویدادها مستقیم رندر می‌شوند.
  const [card, projectCalendar, publishingCalendar, tasksCalendar, workspaceCalendar] = await Promise.all([
    source('../src/components/calendar/CalendarEventCard.tsx'),
    source('../src/components/projects/ProjectCalendarView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
    source('../src/components/tasks/MyTasksView.tsx'),
    source('../src/components/workspace/WorkspaceList.tsx'),
  ]);
  // CalendarSettledGroup هنوز ممکن است در کامپوننت باشد اما دیگر استفاده نمی‌شود؛ مهم این است که تقویم‌ها آن را رندر نکنند.
  assert.doesNotMatch(projectCalendar, /<CalendarSettledGroup/);
  assert.doesNotMatch(publishingCalendar, /<CalendarSettledGroup/);
  assert.doesNotMatch(tasksCalendar, /<CalendarSettledGroup/);
  assert.doesNotMatch(workspaceCalendar, /<CalendarSettledGroup/);
  // هر تقویم همهٔ رویدادهای همان روز را مستقیم و به ترتیب ساعت نشان می‌دهد.
  assert.ok(projectCalendar.includes('sortCalendarEventsByTime('));
  assert.ok(publishingCalendar.includes('sortCalendarEventsByTime<PublicationCalendarEntry>'));
  assert.ok(tasksCalendar.includes('sortCalendarEventsByTime<Task>'));
  assert.ok(workspaceCalendar.includes('sortCalendarEventsByTime<Task>'));
});

test('مدال روز نام مسئول را نشان می‌دهد و دیگر مدال تودرتو باز نمی‌کند', async () => {
  const [projectCalendar, publishingCalendar] = await Promise.all([
    source('../src/components/projects/ProjectCalendarView.tsx'),
    source('../src/components/content/PublishingCalendar.tsx'),
  ]);
  // مدال رویداد تودرتو حذف شده است.
  assert.doesNotMatch(projectCalendar, /EventDetailsPopup/);
  assert.doesNotMatch(projectCalendar, /fixed inset-0 z-50/);
  // کلیک روی رویداد، مقصد واقعی را باز می‌کند: تسک = پنجرهٔ تسک، محتوا/پروژه = صفحهٔ خودشان.
  assert.match(projectCalendar, /const openEvent = \(event: CalendarEvent\) => \{/);
  assert.match(projectCalendar, /setSelectedDay\(null\);/);
  assert.match(projectCalendar, /if \(event\.kind === 'task'\) setSelectedTaskId\(event\.entityId\);/);
  assert.match(projectCalendar, /setSelectedContentId\(event\.entityId\); setActiveView\('content-detail'\);/);
  assert.match(projectCalendar, /setSelectedProjectId\(event\.entityId\); setActiveView\('project-detail'\);/);
  // نام مسئول ارتباط با محتوا/پروژه/تسک در مدال روز.
  assert.match(projectCalendar, /ownerName: userName\(project\.projectManagerId\)/);
  assert.match(projectCalendar, /ownerName: userName\(content\.ownerId\)/);
  assert.match(projectCalendar, /ownerName: userName\(task\.assigneeId\)/);
  assert.match(projectCalendar, /مسئول: \{event\.ownerName \|\| 'ثبت نشده'\}/);
  // تقویم انتشار هم نام مسئول انتشار/مالک را در مدال روز نشان می‌دهد.
  assert.match(publishingCalendar, /const owner = users\.find\(user => user\.id === \(content\.publisherId \|\| content\.ownerId\)\);/);
  assert.match(publishingCalendar, /مسئول: \{owner \?/);
});

test('توضیح زیر عنوان تب‌ها در جزئیات محتوا و جزئیات مجموعه حذف شده است', async () => {
  const [detail, series] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/ContentSeriesView.tsx'),
  ]);
  const detailTabs = detail.slice(detail.indexOf('const detailTabs'), detail.indexOf('</nav>', detail.indexOf('const detailTabs')));
  assert.ok(detailTabs.length > 0);
  assert.doesNotMatch(detailTabs, /hint/);
  const seriesTabs = series.slice(series.indexOf('const tabs = ['), series.indexOf('</nav>', series.indexOf('const tabs = [')));
  assert.ok(seriesTabs.length > 0);
  assert.doesNotMatch(seriesTabs, /hint/);
  // عنوان تب‌ها بزرگ‌تر و بدون خط دوم رندر می‌شود؛ نوبت ۱۹: تب‌های جزئیات محتوا کوچک‌تر شدند (text-[11px])
  assert.match(detail, /className="block truncate text-(?:xs|\[11px\]) font-black">\{item\.label\}<\/span>/);
  assert.match(series, /className="block text-(?:xs|\[11px\]) font-black">\{item\.label\}<\/span>/);
});

test('تب انتشار دکمهٔ کپی کپشن دارد و فقط متن واقعی را کپی می‌کند', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(detail, /const copyCaption = async \(\) => \{/);
  assert.match(detail, /await navigator\.clipboard\.writeText\(caption\);/);
  assert.match(detail, /const caption = String\(content\.publishInfo\?\.caption \|\| ''\)\.trim\(\);/);
  assert.match(detail, /\{captionCopied \? 'کپی شد' : 'کپی کپشن'\}/);
  assert.match(detail, /disabled=\{!content\.publishInfo\?\.caption\}/);
  // بدون متن، هیچ چیز ساختگی کپی نمی‌شود.
  assert.doesNotMatch(detail, /writeText\('—'\)/);
});

test('سربرگ ورودی/خروجی ساده‌تر و شمارندهٔ بزرگ‌تر است', async () => {
  const [stageAssets, detail] = await Promise.all([
    source('../src/components/content/StageAssetSections.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
  ]);
  assert.doesNotMatch(stageAssets, /readyCount/);
  assert.doesNotMatch(stageAssets, /waitingCount/);
  assert.doesNotMatch(stageAssets, /open \? description : summary/);
  assert.doesNotMatch(stageAssets, /description: string;/);
  assert.match(stageAssets, /<h4 className="text-sm font-black text-slate-800">\{title\}<\/h4>/);
  assert.match(stageAssets, /rounded-full px-2\.5 py-1 text-xs font-black leading-none/);
  // نوبت ۱۷: ورودی‌ها وقتی خالی‌اند پنهان‌اند، خروجی‌ها همیشه باز با پیش‌نمایش تصویر + excerpt متن.
  assert.match(stageAssets, /items\.length === 0/);
  assert.match(stageAssets, /IMAGE_EXT|isImageView/);
  assert.match(stageAssets, /textExcerpt/);
  // هیچ‌کدام از محل‌های استفاده، توضیح زیر عنوان نمی‌فرستد.
  const usageBlocks = detail.match(/<StageAssetSection[\s\S]*?\/>/g) || [];
  assert.equal(usageBlocks.length >= 2, true, 'محل‌های استفادهٔ StageAssetSection پیدا شوند');
  for (const block of usageBlocks) assert.ok(!block.includes('description='), 'سربرگ ورودی/خروجی توضیح نمی‌گیرد');
  // پیش‌نویس‌ها همچنان در سربرگ دیده می‌شوند.
  assert.match(stageAssets, /پیش‌نویس\/پیش‌بینی‌شده/);
});

test('مسئول و ارزیاب مرحله با کلیک و بدون پنجرهٔ ویرایش جریان تغییر می‌کنند', async () => {
  const [detail, context, review] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/context/AppContext.tsx'),
    backend('app/Services/ContentReview.php'),
  ]);
  // دروازهٔ رابط کاربری: مدیر جریان یا مدیر محتوا.
  assert.match(detail, /const canAssignStagePeople = canManageContentWorkflow \|\| currentUser\.role === 'content_manager';/);
  assert.match(detail, /const changeStagePerson = async \(stage: ContentStage, field: 'assignee' \| 'reviewer', userId: string\)/);
  assert.match(detail, /await assignStageResponsibility\(content\.id, stage\.id, field === 'assignee'/);
  assert.match(detail, /\{ reviewerId: userId, reviewerStrategy: 'stage_reviewer' \}/);
  // هر دو نشان، فهرست انتخاب را باز می‌کنند و گزینه‌ها از دادهٔ واقعی کاربران می‌آیند.
  assert.match(detail, /stagePersonPanel\(stage, 'assignee'\)/);
  assert.match(detail, /stagePersonPanel\(stage, 'reviewer'\)/);
  assert.match(detail, /const stagePeopleOptions = \(stage: ContentStage, field: 'assignee' \| 'reviewer'\) => \{/);
  assert.match(detail, /\(user\.permissions \|\| \[\]\)\.includes\('content\.approve'\)/);
  assert.match(detail, /aria-haspopup=\{canAssignStagePeople \? 'listbox' : undefined\}/);
  // مسیر داده همان قرارداد موجود است و فیلد سیاست ارزیاب را هم می‌پذیرد.
  assert.match(context, /reviewerStrategy\?:ContentStage\['reviewerStrategy'\]/);
  // سرور: مدیر محتوا فقط جانشینی مسئول/ارزیاب را می‌تواند، نه تغییر ساختار.
  assert.match(review, /public function canAssignStagePeople\(User \$actor\): bool/);
  assert.match(review, /\$actor->role\?->key === 'content_manager'/);
  assert.match(review, /if \(\$canAssignPeople && in_array\(\$field, \['assigneeId', 'reviewerId'\], true\)\) \{\s*\n\s*continue;/);
  // تغییر سیاست ارزیاب فقط همراه با انتخاب صریح همان ارزیاب پذیرفته می‌شود.
  assert.ok(review.includes("(string) ($stage['reviewerId'] ?? '') !== ''"));
});
