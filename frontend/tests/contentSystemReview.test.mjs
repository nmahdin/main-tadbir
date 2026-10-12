import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const contentDetail = read('../src/components/content/ContentDetailView.tsx');
const contentList = read('../src/components/content/ContentMainView.tsx');
const stageAssets = read('../src/components/content/StageAssetSections.tsx');
const workflowModal = read('../src/components/content/EditWorkflowModal.tsx');
const sidebar = read('../src/components/layout/Sidebar.tsx');
const settings = read('../src/components/settings/SettingsView.tsx');
const platformModal = read('../src/components/settings/PlatformModal.tsx');
const publishingView = read('../src/components/content/ContentPublishingView.tsx');
const analyticsView = read('../src/components/analytics/AnalyticsView.tsx');
const statusBadges = read('../src/utils/statusBadges.tsx');
const dateUtils = read('../src/utils/date.ts');

const backend = (path) => read(`../../backend/${path}`);
const statusPolicy = backend('app/Support/Content/ContentStatusPolicy.php');
const commentNotifications = backend('app/Services/CommentNotifications.php');
const analyticsController = backend('app/Http/Controllers/Api/V1/AnalyticsController.php');
const settingsService = backend('app/Services/Organization/OrganizationSettings.php');

test('content detail header keeps one badge geometry and Persian publication schedule', () => {
  // نشانگرهای وضعیت/مجموعه/دپارتمان از هندسهٔ مشترک می‌آیند
  assert.match(statusBadges, /export const DETAIL_BADGE_CLASS = '[^']*h-7[^']*text-\[10px\]/);
  assert.match(contentDetail, /content\.seriesId && <button[\s\S]{0,240}DETAIL_BADGE_CLASS/);
  assert.match(contentDetail, /<Building2 className="h-3\.5 w-3\.5" \/>\{dept\?\.name/);
  assert.match(contentDetail, /<ContentStatusBadge status=\{content\.status\} size="md" \/>/);

  // کد محتوا در ردیف توضیحات و بدون برچسب «پروندهٔ محتوا»
  assert.doesNotMatch(contentDetail, /پروندهٔ محتوا</);
  assert.match(contentDetail, /title="کد محتوا"[\s\S]{0,400}\{content\.code \|\| '[^']+'\}/);

  // تاریخ و ساعت انتشار شمسی می‌شوند و ساعت جعلی ساخته نمی‌شود
  assert.match(contentDetail, /formatPersianDate\(content\.publishInfo\.date\)/);
  assert.match(contentDetail, /formatPersianDateTime\(content\.publishInfo\?\.date, content\.publishInfo\?\.time\)/);
  assert.doesNotMatch(contentDetail, /'۱۸:۰۰'/);
  assert.match(dateUtils, /formatPersianIsoDateTime/);
});

test('inputs and outputs share one component with in-page preview and no navigation button', () => {
  for (const label of ['ورودی‌های مرحله', 'خروجی‌های مرحله']) assert.match(contentDetail, new RegExp(label));
  const inputSection = contentDetail.indexOf('kind="input"');
  const outputSection = contentDetail.indexOf('kind="output"');
  assert.ok(inputSection > -1 && outputSection > inputSection, 'ورودی و خروجی هر دو با یک کامپوننت مشترک رندر می‌شوند');
  // کارت‌ها فقط پیش‌نمایش می‌دهند و دکمهٔ پرش‌دهنده ندارند
  assert.match(stageAssets, /onClick=\{\(\) => onPreview\(view\)\}/);
  assert.doesNotMatch(stageAssets, /باز کردن/);
  // انواع غیرقابل‌پیش‌نمایش پیام روشن می‌گیرند و دانلود باقی می‌ماند
  assert.match(stageAssets, /mode === 'unsupported'/);
  assert.match(stageAssets, /mode === 'document'[\s\S]{0,200}<iframe/);
  assert.match(stageAssets, /دانلود فایل/);
  // پیوست‌های مخزن هم به همان پیش‌نمایش درون‌صفحه‌ای وصل‌اند
  assert.match(contentDetail, /linkedAssetView/);
  assert.match(contentDetail, /StageAssetPreviewModal/);
  assert.match(contentDetail, /canLoadAsset=\{hasPermission\('assets\.view'\)\}/);
});

test('content list header actions share one geometry and the deadline range filters correctly', () => {
  assert.match(contentList, /const HEADER_ACTION_CLASS = 'min-h-10[^']*'/);
  for (const label of ['میز انتشار', 'محتوای منتشرشده', 'محتوای جدید']) assert.match(contentList, new RegExp(label));
  assert.equal((contentList.match(/className=\{HEADER_ACTION_CLASS\}/g) || []).length, 3);
  assert.doesNotMatch(contentList, /action="create"[\s\S]{0,80}محتوای جدید/);

  // بازهٔ تاریخ با همهٔ فیلترهای دیگر ترکیب می‌شود
  assert.match(contentList, /const \[deadlineFrom, setDeadlineFrom\] = useState\(''\)/);
  assert.match(contentList, /if \(deadlineFrom && \(!c\.deadline \|\| c\.deadline < deadlineFrom\)\) return false;/);
  assert.match(contentList, /if \(deadlineTo && \(!c\.deadline \|\| c\.deadline > deadlineTo\)\) return false;/);
  assert.match(contentList, /if \(value && deadlineTo && value > deadlineTo\) setDeadlineTo\(value\)/);
  assert.match(contentList, /const clearFilters = \(\) => \{ setTypeFilter\('all'\); setTimeFilter\('all'\); setDeadlineFrom\(''\); setDeadlineTo\(''\); \}/);
  assert.match(contentList, /const activeFilterCount = \[/);
  assert.match(contentList, /<PersianDatePicker[\s\S]{0,200}label="مهلت از تاریخ"/);
  assert.match(contentList, /<PersianDatePicker[\s\S]{0,200}label="مهلت تا تاریخ"/);

  // رنگ انتخاب یکدست است و تمایز وضعیت با نقطهٔ رنگی می‌ماند
  assert.match(contentList, /statusFilter === status\.id \? 'bg-indigo-600 text-white'/);
  assert.doesNotMatch(contentList, /backgroundColor: status\.color \} : undefined\}/);
});

test('retired approving status is normalized on the server and gone from the UI lists', () => {
  assert.match(statusPolicy, /public const RETIRED = \['approving' => 'reviewing'\]/);
  assert.match(statusPolicy, /public static function normalize\(mixed \$status\): mixed/);
  assert.match(statusPolicy, /\$incoming = self::normalize\(\$incoming\);/);
  assert.match(settingsService, /array_keys\(ContentStatusPolicy::RETIRED\)/);
  const defaults = read('../src/context/AppContext.tsx');
  assert.doesNotMatch(defaults, /id: 'approving'/);
  const editForm = read('../src/components/content/EditContentModal.tsx');
  assert.doesNotMatch(editForm, /value="approving"/);
  const demo = read('../src/demo/initialData.ts');
  assert.doesNotMatch(demo, /'approving'/);
});

test('comment notifications reach the task owner, all content members and the replied author', () => {
  assert.match(commentNotifications, /'task' => \$this->taskRecipients\(\(int\) \$comment->subject_id\)/);
  assert.match(commentNotifications, /'content' => \$this->contentRecipients\(\(int\) \$comment->subject_id\)/);
  assert.match(commentNotifications, /\$parentAuthor = Comment::query\(\)->whereKey\(\$comment->parent_id\)->value\('user_id'\)/);
  assert.match(commentNotifications, /private function contentRecipients\(int \$contentId\): array/);
  assert.match(commentNotifications, /\$content->owner_id,[\s\S]{0,120}\.\.\.\$this->payloadMemberIds/);
  assert.match(commentNotifications, /private function watcherIds\(int \$contentId\): array/);
  assert.match(commentNotifications, /'idea', 'asset' => \$this->threadRecipients/);
  assert.match(commentNotifications, /\(int\) \$id !== \(int\) \$actor->id/);
  assert.match(commentNotifications, /->where\('status', 'active'\)/);
});

test('workflow edit modal keeps drafts, validates and warns before overwriting server changes', () => {
  assert.match(workflowModal, /baseline\.version !== content\.reviewVersion|content\.reviewVersion \|\| ''\) === baseline\.version/);
  assert.match(workflowModal, /if \(latest\.current\.dirty\) \{ setRemoteChanged\(true\); return; \}/);
  assert.match(workflowModal, /بارگذاری داده‌های سرور/);
  assert.match(workflowModal, /const validationMessage = \(\): string => \{/);
  assert.match(workflowModal, /جریان محتوا باید حداقل یک مرحله داشته باشد\./);
  assert.match(workflowModal, /تغییرات ذخیره‌نشدهٔ جریان محتوا از دست می‌رود\. خارج می‌شوید؟/);
  assert.match(workflowModal, /const removeStage = \(id: string\) => \{/);
  assert.match(workflowModal, /dependsOnStageIds: dependencies, status: unlocked/);
  assert.match(workflowModal, /status: stage\.reviewRequired \? stage\.status : statusWithoutReview\(stage\.status\)/);
});

test('settings and sidebar cleanups keep the rest of the layout intact', () => {
  assert.doesNotMatch(sidebar, /دیدگاه‌ها، کاربران، نقش‌ها و تنظیمات/);
  assert.match(sidebar, /مدیریت سامانه/);
  assert.doesNotMatch(settings, /onClick=\{\(\) => setActiveTab\('google-meet'\)\}[\s\S]{0,400}تنظیمات Google Workspace/);
  assert.match(settings, /const address = \(plat\.urlPattern \|\| plat\.defaultHandle \|\| plat\.handle \|\| ''\)\.trim\(\)/);
  assert.match(settings, /\{address && \(/);
  assert.match(platformModal, /در صورت خالی‌بودن، هیچ آدرسی برای این پلتفرم نمایش داده نمی‌شود/);
  assert.doesNotMatch(publishingView, /publishingPlatforms\[0\] \|\| \{ name: ch/);
  assert.match(publishingView, /const platformDisplay = \(channelId: string\) => \{/);
});

test('analytics reports only real aggregates and links every figure to its list', () => {
  assert.match(analyticsController, /'byStatus' => \$contentStatuses/);
  assert.match(analyticsController, /\$contentStatuses = Content::query\(\)->selectRaw\('status, COUNT\(\*\) as total'\)->groupBy\('status'\)->pluck\('total', 'status'\)/);
  assert.match(analyticsView, /byStatus: Record<string, number>/);
  assert.match(analyticsView, /contentStatuses[\s\S]{0,200}report\.contents\.byStatus/);
  assert.match(analyticsView, /navigate\(`\/contents\?status=\$\{encodeURIComponent\(item\.id\)\}`\)/);
  assert.match(analyticsView, /formatPersianIsoDateTime\(reportMeta\?\.generatedAt\)/);
  assert.match(analyticsView, /formatPersianNumber\(item\.value\)/);
  assert.doesNotMatch(analyticsView, /mock|sampleData|fakeData/);
});
