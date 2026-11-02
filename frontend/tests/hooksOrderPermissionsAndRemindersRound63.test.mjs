import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const backend = path => readFileSync(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

const detail = source('components/content/ContentDetailView.tsx');
const stageAssets = source('components/content/StageAssetSections.tsx');
const css = source('index.css');
const roles = source('components/roles/RoleManagementView.tsx');
const navbar = source('components/layout/TopNavbar.tsx');
const myTasks = source('components/tasks/MyTasksView.tsx');
const workspace = source('components/workspace/WorkspaceList.tsx');
const deadlineChip = source('components/common/DeadlineChip.tsx');
const reminders = backend('app/Services/PublicationReminders.php');
const inbox = backend('app/Http/Controllers/Api/V1/NotificationInboxController.php');

/**
 * دور ۶۳: خطای غیرمنتظرهٔ React (#310)، مربع‌شدن کلید مجوزها، فاصلهٔ اعلان‌ها،
 * یادآوری انتشار، رنگ مهلت وظایف بر اساس زمان باقی‌مانده و زمان ساده در تب انتشار.
 */
test('هیچ هوکی پس از بازگشت شرطی تعریف نشده است (رفع خطای React #310)', () => {
  // در صفحهٔ جزئیات محتوا، `useState(downloadingOutputs)` و افکت پیوند
  // `?output=` پیش‌تر بعد از `if (!content) return` بودند.
  const guardIndex = detail.indexOf('  if (!content) {');
  assert.ok(guardIndex > 0, 'گارد !content باید وجود داشته باشد');
  for (const hook of ['const [downloadingOutputs, setDownloadingOutputs] = useState(false);', 'setSelectedStageForDeliverable(stage);']) {
    assert.ok(detail.indexOf(hook) < guardIndex, `${hook} باید پیش از گارد باشد`);
  }
  assert.equal(detail.match(/const stages = /g)?.length, 1, '``stages`` فقط یک بار تعریف می‌شود');

  // در بخش ورودی/خروجی مرحله، useId و useState بعد از `return null` بودند.
  const sectionGuard = stageAssets.indexOf("  if (kind === 'input' && items.length === 0) return null;");
  assert.ok(sectionGuard > 0);
  for (const hook of ['const bodyId = React.useId();', 'const [open, setOpen] = React.useState(']) {
    assert.ok(stageAssets.indexOf(hook) > 0 && stageAssets.indexOf(hook) < sectionGuard, `${hook} باید پیش از return null باشد`);
  }
});

test('کلید روشن/خاموش مجوز مربع ۳۶px با گوشهٔ گرد است', () => {
  const rule = css.match(/\.permission-toggle \{([^}]*)\}/)?.[1] || '';
  assert.ok(rule, 'قاعدهٔ .permission-toggle باید در index.css باشد');
  assert.match(rule, /width: var\(--button-height\);/);
  assert.match(rule, /min-width: var\(--button-height\);/);
  assert.match(rule, /height: var\(--button-height\);/);
  assert.match(rule, /min-height: var\(--button-height\);/);
  // گردی حفظ می‌شود (مربع با گوشه‌های گرد، نه دایره و نه مستطیل باریک).
  assert.match(rule, /border-radius: var\(--radius-md\);/);
  assert.match(rule, /padding: 0;/);
  assert.match(roles, /className=\{`permission-toggle transition-all \$\{/);
  assert.doesNotMatch(roles, /w-7 h-7 rounded-xl mx-auto/);
});

test('اعلان‌های منوی هدر به حاشیه‌ها و هم نمی‌چسبند', () => {
  // سرستون و فهرست، حاشیهٔ داخلی دارند و هر اعلان کارت مستقل با فاصله است.
  assert.match(navbar, /<div className="mx-2 mb-2 flex items-center justify-between rounded-xl border-b border-slate-100 px-3 py-2\.5">/);
  assert.match(navbar, /<div className="max-h-80 space-y-1\.5 overflow-y-auto px-2 pb-1">/);
  assert.match(navbar, /rounded-xl border border-transparent p-3 text-right transition-colors hover:border-slate-200 hover:bg-slate-50/);
  assert.doesNotMatch(navbar, /max-h-72 overflow-y-auto divide-y divide-slate-100/);
  // دکمهٔ پایانی و حالت خالی هم داخل حاشیه می‌نشینند.
  assert.match(navbar, /mx-2 mt-2 w-\[calc\(100%-1rem\)\] rounded-xl/);
  assert.match(navbar, /mx-1 rounded-xl border border-dashed border-slate-200 p-6/);
  // یادآوری انتشار آیکون اختصاصی دارد.
  assert.match(navbar, /case 'reminder':[\s\S]{0,120}<AlarmClock/);
});

test('مهلت وظایف بر اساس زمان باقی‌مانده رنگ می‌گیرد', () => {
  assert.match(deadlineChip, /deadlineState\(deadline\)/);
  assert.match(deadlineChip, /deadlineToneTier\(state\.tier, settled\)/);
  assert.match(deadlineChip, /DEADLINE_CHIP_TONES\[tier\]/);
  assert.match(deadlineChip, /deadlineDaysLabel\(state\)/);
  // مهلت گذشته بنفش، امروز قرمز، فردا کهربایی و دورتر خنثی — همان قاعدهٔ مشترک.
  assert.match(myTasks, /<DeadlineChip deadline=\{task\.deadline\} settled=\{isCompleted\} \/>/);
  assert.match(myTasks, /<DeadlineChip deadline=\{task\.deadline\} settled=\{task\.status === 'completed'\} compact className="text-\[10px\]" \/>/);
  assert.match(workspace, /<DeadlineChip deadline=\{row\.deadline\} settled=\{\['completed', 'archived'\]\.includes\(String\(row\.status\)\)\} \/>/);
});

test('تب «تنظیمات انتشار» فقط زمان ساده را می‌نویسد؛ شمارش معکوس و رنگ فقط در سربرگ', () => {
  // یک محاسبهٔ شمارش معکوس، آن هم فقط برای کادر بالای صفحه.
  assert.equal((detail.match(/publicationRemaining\(/g) || []).length, 1);
  assert.match(detail, /const contentPublicationSurfaceTone = PUBLICATION_SURFACE_TONE_CLASSES\[contentPublicationTone\];/);
  // ردیف سادهٔ زمان انتشار در تب تنظیمات (بدون کلاس رنگ).
  assert.match(
    detail,
    /<div className="border-t border-slate-200\/60 pt-3"><span className="block text-slate-500">زمان انتشار:<\/span><span className="mt-1 block font-bold text-slate-800">\{formatPersianDateTime\(content\.publishInfo\?\.date, content\.publishInfo\?\.time\) \|\| 'تنظیم نشده'\}<\/span><\/div>/,
  );
});

test('یادآوری انتشار برای ناشر و مالک ساخته می‌شود و تکرارپذیر است', () => {
  assert.match(reminders, /final class PublicationReminders/);
  assert.match(reminders, /public const SETTLED = \['published', 'archived', 'cancelled', 'suspended'\];/);
  assert.match(reminders, /whereNotIn\('status', self::SETTLED\)/);
  assert.match(reminders, /whereNotNull\('payload->publishInfo->date'\)/);
  assert.match(reminders, /NotificationPolicy::enabled\('deadlineReminders'\)/);
  // کلید یکتا: اجرای دوباره اعلان تکراری نمی‌سازد.
  assert.match(reminders, /\['notification_key' => hash\('sha256', 'publish:'\.\$subject\.':'\.\$recipient->id\)\]/);
  assert.match(reminders, /'notificationCategory' => 'content'/);
  assert.match(reminders, /\$content->payload\['publisherId'\] \?\? null/);
  // مرکز اعلان‌ها پیش از فهرست، یادآوری را می‌سازد؛ خطای آن هرگز فهرست را نمی‌شکند.
  assert.match(inbox, /use App\\Services\\PublicationReminders;/);
  assert.match(inbox, /app\(PublicationReminders::class\)->run\(null, 20\);/);
  assert.match(inbox, /catch \(Throwable\) \{/);
});
