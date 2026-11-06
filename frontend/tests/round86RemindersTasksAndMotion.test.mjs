import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * دور ۸۶ — یادآوری انتشار، هم‌گامی تسک‌های جریان، انیمیشن‌ها و لودینگ‌ها.
 *
 * هر تست یک قرارداد رفتاری/ظاهری را قفل می‌کند:
 * ۱) پیام یادآوری انتشار دو دکمه دارد و وضعیت پرونده در متنش می‌آید.
 * ۲) ثبت انتشار تاریخ و ساعت دارد (پیش‌فرض «همین حالا») و دکمه‌اش نشانگر دارد.
 * ۳) تسک‌های جریان با تغییر مسئول/ارزیاب و مهلت مرحله هم‌گام می‌شوند.
 * ۴) پیام‌های گفتگو ورود و خروج نرم دارند.
 * ۵) دکمه‌های فقط-موبایل روی نمایشگر دسکتاپ پنهان می‌مانند.
 * ۶) مدال جست‌وجو با انیمیشن باز و بسته می‌شود.
 * ۷) کارت ایده گردتر است.
 * ۸) یادآوری انتشار عقب‌افتاده هر چند ساعت تکرار می‌شود.
 * ۹) «خواندن همه»/«خوانده شدن پیام‌ها» نشانگر لودینگ دارد.
 * ۱۰) دکمهٔ پیش‌نمایش خروجی بدون حاشیه و پس‌زمینه است.
 */

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const backend = (path) => readFileSync(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

const css = source('index.css');
const detail = source('components/content/ContentDetailView.tsx');
const publishing = source('components/content/ContentPublishingView.tsx');
const stages = source('components/content/StageAssetSections.tsx');
const bubble = source('components/chat/MessageBubble.tsx');
const navbar = source('components/layout/TopNavbar.tsx');
const search = source('components/layout/GlobalSearchModal.tsx');
const ideaCard = source('components/thought-room/IdeaCard.tsx');
const notifications = source('components/notifications/NotificationsView.tsx');
const feedback = source('components/common/Feedback.tsx');
const contentsApi = source('api/contents.ts');

const reminders = backend('app/Services/PublicationReminders.php');
const publishInfo = backend('app/Bot/Bale/Handlers/ContentPublishInfo.php');
const taskSync = backend('app/Services/ContentStageTaskSync.php');

test('یادآوری انتشار در بله دو دکمه دارد: اطلاعات انتشار و باز کردن محتوا', () => {
  // دکمهٔ اطلاعات انتشار برای پیامِ بدون وظیفه، با شناسهٔ پرونده ساخته می‌شود.
  assert.match(publishInfo, /'callback_data' => 'pubinfo:content:'\.\$content->id/);
  assert.match(publishInfo, /buttons\(\$link, 'content', \(int\) \$content->id, '🗂 باز کردن محتوا'\)/);
  assert.match(publishInfo, /\^pubinfo:content:\(\\d\{1,18\}\)\$/);
  // لایهٔ ارسال، پیوند مینی‌اپ را به همان تابع دکمه‌سازی می‌دهد.
  assert.match(backend('app/Bot/Bale/Notifications/NotificationDelivery.php'), /notificationRows\(\$user, \$record, \$link\)/);
});

test('وضعیت پرونده در متن یادآوری انتشار می‌آید', () => {
  assert.match(reminders, /وضعیت فعلی: %s/);
  assert.match(reminders, /ContentLabels::class\)->status\(\$content->status\)/);
});

test('ثبت انتشار تاریخ و ساعت دارد و دکمهٔ آن نشانگر لودینگ می‌گیرد', () => {
  // مسیر داده: مدال → لایهٔ فرمان → API → سرویس.
  assert.match(contentsApi, /publish: \(id: string, expectedVersion: string, publishAt\?: \{ date\?: string; time\?: string \}\)/);
  assert.match(contentsApi, /publishDate: publishAt\.date/);
  assert.match(contentsApi, /publishTime: publishAt\.time/);
  assert.match(publishing, /const nowTimeValue = \(\) =>/);
  assert.match(detail, /تاریخ و ساعت ثبت انتشار/);
  // پیش‌فرض «همین حالا»؛ کاربر می‌تواند هر دو را عوض کند.
  assert.match(detail, /openPublicationConfirm/);
  assert.match(detail, /loading=\{publishingContentIds\.includes\(content\.id\)\}/);
  assert.match(detail, /'در حال ثبت انتشار…' : 'تأیید و ثبت انتشار'/);
  // سرور تاریخ/ساعت ارسالی را می‌پذیرد و پیش‌فرضش زمان سازمان است.
  assert.match(backend('app/Http/Requests/PublicationCommandRequest.php'), /publishDate/);
});

test('تغییر مسئول و ارزیاب مرحله، تسک‌های جریان را هم می‌برد', () => {
  // هویت تسک‌های باز با خودِ مرحله هم‌تراز می‌شود (مسئول اجرا، ارزیاب، مهلت).
  assert.match(taskSync, /private function syncStageIdentity\(Content \$content, array \$stage\): void/);
  assert.match(taskSync, /\$assignee = \$task->kind === 'content_review' \? \$reviewerId : \$workAssignee;/);
  assert.match(taskSync, /\$this->syncStageIdentity\(\$content, \$stage\);/);
  // مهلت تسک ارزیاب همان مهلت مرحله است (و نه مهلت پرونده).
  assert.match(taskSync, /\$deadline = \$stageDeadline \?\? \$contentDeadline;/);
  assert.match(taskSync, /'deadline' => \$deadline,/);
  // تسک بسته با تغییر مسئولِ مرحلهٔ باز دوباره باز می‌شود و به فرد تازه می‌رسد.
  assert.match(taskSync, /! \$this->stageFinished\(\$stage\) && \(string\) \$existing->assignee_id !== \(string\) \$assigneeId/);
});

test('پیام‌های گفتگو ورود و خروج نرم دارند', () => {
  assert.match(css, /\.ui-msg-in \{ animation: ui-msg-in/);
  assert.match(css, /\.ui-msg-out \{ animation: ui-msg-out/);
  assert.match(css, /@keyframes ui-msg-out/);
  assert.match(bubble, /ui-msg-in/);
  assert.match(bubble, /leaving \? 'ui-msg-out pointer-events-none' : ''/);
  // حذف پیام پس از پایان انیمیشن خروج انجام می‌شود، نه همان لحظه.
  assert.match(bubble, /window\.setTimeout\(\(\) => deleteRef\.current\(message\.id\), 180\)/);
  // احترام به کاهش حرکت.
  assert.match(css, /\.ui-msg-in, \.ui-msg-out,/);
});

test('دکمه‌های فقط-موبایل روی دسکتاپ پنهان می‌شوند', () => {
  // قاعدهٔ پایهٔ دکمه‌ها بیرون از لایهٔ utilities است و `display` صریح دارد؛
  // پس `hidden`/`sm:hidden`/`md:hidden`/`lg:hidden` باید صریح هم بشوند.
  assert.match(css, /\.ui-button\.md\\:hidden/);
  assert.match(css, /\.ui-icon-button\.lg\\:hidden/);
  assert.match(css, /\.ui-mobile-only \{ display: none !important; \}/);
  assert.match(css, /\.ui-compact-only \{ display: none !important; \}/);
  assert.match(navbar, /ui-tap ui-compact-only/);
  assert.match(navbar, /ui-tap ui-mobile-only/);
  assert.match(navbar, /lg:hidden/);
  assert.match(navbar, /sm:hidden/);
});

test('مدال جست‌وجو با انیمیشن باز و بسته می‌شود', () => {
  assert.match(search, /useExitPresence\(isSearchOpen\)/);
  assert.match(search, /if \(!presence\.visible\) return null;/);
  assert.match(search, /data-state=\{presence\.state\}/);
  assert.match(search, /ui-modal-overlay/);
  assert.match(search, /ui-modal-panel/);
});

test('کارت ایده گردتر از قبل است', () => {
  assert.match(ideaCard, /group bg-white rounded-2xl border border-slate-200\/90/);
  assert.doesNotMatch(ideaCard, /group bg-white rounded-xl border border-slate-200\/90/);
});

test('یادآوری انتشار عقب‌افتاده هر چند ساعت تکرار می‌شود', () => {
  assert.match(reminders, /public const OVERDUE_REPEAT_HOURS = 4;/);
  assert.match(reminders, /':overdue:'\.\$this->bucket\(\$now\)/);
  // کلید یکتای هر بازه از مبنای مطلق زمان ساخته می‌شود (نه ساعت روز).
  assert.match(reminders, /intdiv\(\$moment->getTimestamp\(\), \$hours \* 3600\)/);
});

test('«خواندن همه»ی پیام‌ها نشانگر لودینگ دارد', () => {
  assert.match(notifications, /const \[markingAll, setMarkingAll\] = useState\(false\);/);
  assert.match(notifications, /markingAll \? <LoaderCircle className=\"h-4 w-4 animate-spin\" aria-hidden \/> : <CheckCheck/);
  assert.match(notifications, /'در حال علامت‌گذاری…' : 'خواندن همه'/);
  assert.match(notifications, /aria-busy=\{markingAll \|\| undefined\}/);
  // پیام‌های سربرگ هم همان نشانگر را دارند.
  assert.match(navbar, /در حال علامت‌گذاری/);
});

test('توست پیام‌ها هم انیمیشن خروج دارند', () => {
  assert.match(feedback, /export const TOAST_EXIT_MS = 180;/);
  assert.match(feedback, /closing \? 'ui-toast-out' : 'ui-toast-in'/);
  assert.match(css, /\.ui-toast-out \{ animation: ui-toast-out/);
});

test('دکمهٔ پیش‌نمایش خروجی محتوا بدون حاشیه و پس‌زمینه است', () => {
  assert.match(stages, /<Button variant="ghost" onClick=\{\(\) => onPreview\(view\)\} title="پیش‌نمایش این خروجی" className="!border-0 !bg-transparent/);
  // رنگ متن و آیکون هم حالت «دکمهٔ متنی» دارد، نه دکمهٔ ثانویهٔ کادردار.
  assert.doesNotMatch(stages, /<Button variant="secondary" onClick=\{\(\) => onPreview\(view\)\}/);
});
