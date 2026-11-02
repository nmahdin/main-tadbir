import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('the related-tasks done toggle is a circle, not a rounded square', async () => {
  const related = await source('../src/components/workspace/RelatedRecords.tsx');
  // نوبت ۶۷: دکمهٔ تیک «تکمیل» در تب تسک‌های مرتبط گرد است.
  assert.match(related, /className=\{`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors/);
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
