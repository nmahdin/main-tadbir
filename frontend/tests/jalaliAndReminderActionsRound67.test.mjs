import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('the related-tasks done toggle is a circle, not a rounded square', async () => {
  const related = await source('../src/components/workspace/RelatedRecords.tsx');
  // نوبت ۶۷: دکمهٔ تیک «تکمیل» در تب تسک‌های مرتبط گرد است.
  // دور ۸۱: علاوه بر `rounded-full`، کلاس صریحِ `ui-check-circle` هم آمده تا
  // قاعدهٔ پایهٔ `button` (گردی --radius-md) نتواند آن را مربع کند.
  assert.match(related, /className=\{`ui-check-circle !rounded-full flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors/);
  // دور ۸۳: گردی درون‌خطی هم قفل شد تا هیچ قاعدهٔ سراسری آن را مربع نکند.
  assert.match(related, /style=\{\{ borderRadius: '50%', minHeight: 0 \}\}/);
  assert.doesNotMatch(related, /rounded-md border-2 transition-colors/);
  assert.match(related, /aria-label=\{completed\?'بازگشایی وظیفه':'تکمیل وظیفه'\}/);
  // سررسید همان وظیفه‌ها با نشان رنگیِ زمان باقی‌مانده و تاریخ شمسی می‌آید.
  assert.match(related, /<DeadlineChip deadline=\{row\.deadline\} settled=\{completed\}\/>/);
});

test('server-built reminder text is Jalali and keeps the machine ISO date in the payload', async () => {
  const [reminders, jalali, test] = await Promise.all([
    source('../../backend/app/Services/PublicationReminders.php'),
    source('../../backend/app/Support/Calendar/JalaliDate.php'),
    source('../../backend/tests/Feature/PublicationReminderTest.php'),
  ]);

  // متن اعلان از تاریخ شمسی ساخته می‌شود، نه از رشتهٔ ISO.
  assert.match(reminders, /private function stamp\(string \$date, string \$time\): string\s*\{\s*return JalaliDate::shortWithTime\(\$date, \$time === '' \? null : \$time\);/);
  assert.match(jalali, /app\(PersianCalendar::class\)->fromGregorian\(CarbonImmutable::parse\(substr\(\$isoDate, 0, 10\)\)\)/);
  assert.match(jalali, /return strtr\(\$formatted, self::DIGITS\);/);
  // رقم‌های متن فارسی‌اند و عدد لاتین در متن اعلان نمی‌ماند.
  assert.match(jalali, /private const DIGITS = \['0' => '۰'/);
  // کلید یکتا و فیلد ماشینی همچنان میلادی می‌مانند (تشخیص تکرار به تقویم وابسته نیست).
  assert.match(reminders, /'publishDate' => \$date/);
  assert.ok(test.includes("preg_match('/\\d{4}-\\d{2}-\\d{2}/', (string) $n->payload['message'])"), 'متن اعلان هیچ تاریخ میلادی خامی ندارد');
});

test('notification rows carry an explicit action button with a type-aware label', async () => {
  const [view, inbox] = await Promise.all([
    source('../src/components/notifications/NotificationsView.tsx'),
    source('../src/components/workspace/NotificationInbox.tsx'),
  ]);

  assert.match(view, /const actionLabel = \(notification: AppNotification\): string => \{/);
  assert.match(view, /if \(notification\.type === 'overdue'\) return notification\.linkContentId \? 'انتشار محتوا' : 'رفع تأخیر';/);
  assert.match(view, /if \(notification\.type === 'reminder'\) return notification\.linkContentId \? 'برنامه‌ریزی انتشار' : 'مشاهده وظیفه';/);
  assert.match(view, /title=\{actionLabel\(notification\)\} aria-label=\{actionLabel\(notification\)\}/);
  // دکمهٔ اقدام ۳۶ پیکسلی است و لینک نامه/مصوبه هم باز می‌شود.
  assert.match(view, /className="ui-button ui-button-ghost !min-h-9 !px-2\.5 text-\[10px\]"/);
  assert.match(view, /else if \(notification\.linkLetterId\) \{ setSelectedLetterId/);
  assert.match(view, /notification\.linkLetterId \|\| notification\.linkResolutionId/);

  // تاریخ اعلان‌ها در هر دو صفحه با ابزار شمسی مشترک نمایش داده می‌شود.
  assert.match(view, /\{formatPersianIsoDateTime\(notification\.timestamp\) \|\| '—'\}/);
  assert.match(inbox, /\{formatPersianIsoDateTime\(row\.timestamp \|\| row\.createdAt\) \|\| '—'\}/);
  assert.doesNotMatch(inbox, /toLocaleDateString\('fa-IR'\)/);
});

test('content list rows expose real actions and a compact progress cell', async () => {
  const list = await source('../src/components/workspace/WorkspaceList.tsx');

  // تنها دکمهٔ ستون عملیات در فهرست محتوا «نمایش» است.
  assert.match(list, /module === 'contents' \? <Link to=\{detail\(row\.id\)\} aria-label=\{`نمایش \$\{titleOf\(row\)\}`\} title="نمایش"/);
  assert.doesNotMatch(list, /archiveItem\('content'/);
  // ستون وضعیت پهن‌تر و ستون عملیات باریک‌تر شد.
  assert.match(list, /<th className=\{module === 'contents' \? 'w-56 p-4' : 'p-4'\}>وضعیت<\/th>/);
  assert.match(list, /<th className=\{module === 'contents' \? 'w-14 p-4 text-left' : 'p-4 text-left'\}>عملیات<\/th>/);
  assert.match(list, /module === 'contents' \? <div className="w-48 min-w-0">/);
  assert.match(list, /module === 'contents' \? 'w-14 p-4' : 'p-4'/);
  // فهرست هیچ رنگ بنفش اختصاصی ندارد و نوار پیشرفت جمع‌وجور می‌ماند.
  assert.doesNotMatch(list, /violet/);
  assert.match(list, /compact = false/);
});

test('relative activity time uses Persian digits and a deterministic Jalali date', async () => {
  const activity = await source('../src/components/activity/ActivityView.tsx');
  assert.match(activity, /return `\$\{formatPersianNumber\(diffMinutes\)\} دقیقه پیش`;/);
  assert.match(activity, /return formatPersianDateLong\(date\);/);
  assert.doesNotMatch(activity, /date\.toLocaleDateString\('fa-IR'\)/);
});

test('the content list has no publication-calendar tab and keeps deep links safe', async () => {
  const [list, desk] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/content/ContentPublishingView.tsx'),
  ]);

  // تب «تقویم انتشار» از فهرست محتوا حذف شد؛ تقویم فقط در میز انتشار می‌ماند.
  assert.doesNotMatch(list, /تقویم انتشار/);
  assert.doesNotMatch(list, /PublishingCalendar/);
  assert.match(list, /requestedView === 'cards' \? 'cards' : 'list'/);
  assert.doesNotMatch(list, /module === 'contents' && view === 'calendar'/);
  assert.match(desk, /<PublishingCalendar/);
});

test('collapsible panels animate their real height and stay inert while closed', async () => {
  const [collapsible, css] = await Promise.all([
    source('../src/components/common/Collapsible.tsx'),
    source('../src/index.css'),
  ]);

  assert.match(collapsible, /data-open=\{open \? 'true' : 'false'\}/);
  assert.match(collapsible, /inert=\{!open\}/);
  assert.match(collapsible, /ui-collapsible-inner/);
  // ارتفاع واقعی با 0fr → 1fr باز می‌شود، بدون max-height حدسی.
  assert.match(css, /\.ui-collapsible \{\s*display: grid;\s*grid-template-rows: 0fr;/);
  assert.match(css, /\.ui-collapsible\[data-open='true'\] \{ grid-template-rows: 1fr; opacity: 1; \}/);
  assert.match(css, /\.ui-collapsible > \.ui-collapsible-inner \{ overflow: hidden; min-height: 0; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ui-collapsible \{ transition: none; \}/);

  // پنل‌های جمع‌شو به این کامپوننت مشترک منتقل شدند.
  const panels = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/content/ContentSeriesView.tsx'),
    source('../src/components/thought-room/ThinkTankMeetingsTab.tsx'),
    source('../src/components/thought-room/ThoughtRoomMainView.tsx'),
    source('../src/components/tasks/TaskDetailDrawer.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/layout/Sidebar.tsx'),
    source('../src/components/calendar/CalendarEventCard.tsx'),
  ]);
  assert.equal(panels.filter(text => text.includes("from '../common/Collapsible'")).length, panels.length);
});

