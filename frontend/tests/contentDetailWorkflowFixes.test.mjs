import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const contentDetail = read('../src/components/content/ContentDetailView.tsx');
const stageAssets = read('../src/components/content/StageAssetSections.tsx');
const editContent = read('../src/components/content/EditContentModal.tsx');
const contentList = read('../src/components/content/ContentMainView.tsx');
const seriesView = read('../src/components/content/ContentSeriesView.tsx');
const statusBadges = read('../src/utils/statusBadges.tsx');
const dateUtils = read('../src/utils/date.ts');
const listQuery = read('../src/routing/listQuery.ts');
const appContext = read('../src/context/AppContext.tsx');
const types = read('../src/types.ts');
const contentWorkflow = read('../src/utils/contentWorkflow.ts');

const backend = (path) => read(`../../backend/${path}`);
const stageSync = backend('app/Services/ContentStageTaskSync.php');
const deadlineSweep = backend('app/Services/ContentDeadlineSweep.php');
const statusPolicy = backend('app/Support/Content/ContentStatusPolicy.php');
const contentController = backend('app/Http/Controllers/Api/V1/ContentController.php');
const contentRequest = backend('app/Http/Requests/ContentRequest.php');
const writeHistory = backend('app/Services/ContentWriteHistory.php');
const consoleRoutes = backend('routes/console.php');
const delayedMigration = backend('database/migrations/2026_10_12_000002_add_delayed_content_status.php');

test('the status command menu escapes the header card instead of being clipped', () => {
  // منو با createPortal روی document.body و موقعیت ثابت رندر می‌شود
  assert.match(contentDetail, /import \{ createPortal \} from 'react-dom'/);
  assert.match(contentDetail, /createPortal\(<>/);
  assert.match(contentDetail, /,\s*document\.body\)\}/);
  assert.match(contentDetail, /style=\{\{ position: 'fixed', top: statusMenuPos\?\.top \?\? 0, right: statusMenuPos\?\.right \?\? 8 \}\}/);
  // مختصات از خود نشانگر اندازه‌گیری می‌شود، نه از کادر سربرگ
  assert.match(contentDetail, /const rect = statusBadgeRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(contentDetail, /right: Math\.round\(Math\.max\(8, window\.innerWidth - rect\.right\)\)/);
  // پنل دیگر با کلاس absolute داخل کارت گیر نمی‌کند
  assert.doesNotMatch(contentDetail, /absolute right-0 top-full z-50/);
  // دسترس‌پذیری و بستن با اسکرول/تغییر اندازه
  assert.match(contentDetail, /aria-haspopup="menu" aria-expanded=\{statusMenuOpen\}/);
  assert.match(contentDetail, /window\.addEventListener\('scroll', close, true\)/);
  assert.match(contentDetail, /window\.addEventListener\('resize', close\)/);
});

test('the executing department is resolved, saved and shown from real data', () => {
  // حل شناسه مستقل از نوع رشته/عدد + پشتوانهٔ دپارتمان مراحل برای پرونده‌های قدیمی
  // پیاده‌سازی مشترک `sameId` در utils/contentWorkflow.ts است و همین صفحه آن را
  // وارد می‌کند (یک پیاده‌سازی برای همهٔ مقایسه‌های شناسه در رابط کاربری).
  assert.match(contentWorkflow, /export const sameId = \(left\?: string \| number \| null, right\?: string \| number \| null\): boolean =>/);
  assert.match(contentDetail, /import \{[^}]*\bsameId\b[^}]*\} from '\.\.\/\.\.\/utils\/contentWorkflow';/);
  assert.match(contentDetail, /const stageDepartment = \(content\.stages \|\| \[\]\)\.find\(stage => stage\.departmentId \|\| stage\.departmentName\)/);
  assert.match(contentDetail, /const dept = departments\.find\(d => sameId\(d\.id, departmentId\)\)/);
  assert.match(contentDetail, /دپارتمان مجری از دپارتمان مرحله‌های جریان محتوا خوانده شده است/);
  assert.match(contentDetail, /const stageDept = departments\.find\(d => sameId\(d\.id, stage\.departmentId\)\)/);
  // انتخاب دپارتمان در ویرایش، حداقل یک گزینهٔ صریح «تعیین نشده» دارد تا مرورگر
  // اولین دپارتمان را به‌جای مقدار خالی نشان ندهد
  assert.match(editContent, /<option value="">دپارتمان تعیین نشده \(از مرحله‌های جریان\)<\/option>/);
  assert.match(editContent, /دپارتمان شناخته‌نشده \(شناسهٔ \$\{departmentId\}\)/);
  assert.match(editContent, /setDepartmentId\(content\.departmentId \? String\(content\.departmentId\) : ''\)/);
  // مسیر ذخیره: ستون دپارتمان وجود ندارد و مقدار داخل payload می‌ماند
  assert.match(contentRequest, /'departmentId' => \['sometimes', 'nullable', 'string', 'max:120'\]/);
  assert.match(writeHistory, /if \(array_key_exists\('departmentId', \$input\)/);
  assert.match(stageSync, /if \(empty\(\$payload\['departmentId'\]\) && empty\(\$payload\['departmentIds'\]\)\)/);
});

test('the publishing-calendar shortcut is gone from the content detail page', () => {
  assert.doesNotMatch(contentDetail, /تقویم و میز انتشار/);
  assert.doesNotMatch(contentDetail, /setActiveView\('content-publishing'\)/);
  assert.doesNotMatch(contentDetail, /Share2/);
  // میز انتشار همچنان در مسیر مستقل خودش وجود دارد
  assert.match(read('../src/components/content/ContentPublishingView.tsx'), /ContentPublishingView/);
});

test('the content code is bolder and more readable next to the description', () => {
  assert.match(contentDetail, /title="کد محتوا" className="inline-flex h-8 shrink-0 items-center gap-1\.5 rounded-xl border border-slate-300 bg-slate-100 px-3 font-mono text-xs font-black tracking-\[0\.08em\]/);
  assert.match(contentDetail, /<Hash className="h-4 w-4 text-slate-500" \/>/);
});

test('the reviewer chip uses the same grey tone as the other responsibility chips', () => {
  const chipStart = contentDetail.indexOf('" title="ارزیاب مرحله"');
  assert.ok(chipStart > -1, 'نشان ارزیاب باید عنوان توضیحی داشته باشد');
  const chip = contentDetail.slice(Math.max(0, chipStart - 160), contentDetail.indexOf('{stageDeadline &&'));
  assert.match(chip, /bg-slate-50 px-2\.5 py-1\.5 rounded-xl border border-slate-200/);
  assert.doesNotMatch(chip, /amber/);
  assert.match(chip, /<span className="font-bold text-slate-800 text-xs px-1 py-0\.5">ارزیاب: \{approver\.name\}<\/span>/);
  assert.match(chip, /بدون نیاز به ارزیاب/);
  assert.match(chip, /ارزیاب تعیین نشده/);
});

test('stage deadlines carry tier colours and drive the derived «تأخیر» status', () => {
  // رده‌بندی روزمحور در ابزار تاریخ
  assert.match(dateUtils, /export const deadlineState = \(value\?: string \| Date \| null, today: Date = new Date\(\)\): DeadlineState =>/);
  assert.match(dateUtils, /if \(days < 0\) return \{ tier: 'past', days \};/);
  assert.match(dateUtils, /if \(days === 0\) return \{ tier: 'today', days \};/);
  assert.match(dateUtils, /if \(days === 1\) return \{ tier: 'soon', days \};/);
  // یک روز مانده کهربایی، امروز قرمز ملایم، گذشته بنفش ملایم
  assert.match(contentDetail, /soon: 'border-amber-200 bg-amber-50 text-amber-800'/);
  assert.match(contentDetail, /today: 'border-rose-200 bg-rose-50 text-rose-700'/);
  assert.match(contentDetail, /past: 'border-violet-200 bg-violet-50 text-violet-700'/);
  assert.match(contentDetail, /const stageOverdue = Boolean\(stageDeadline && stageDeadline\.tier === 'past' && OPEN_STAGE_STATUSES\.includes\(stage\.status\)\)/);
  assert.match(contentDetail, /\{stageDeadline && \(/);
  // مرحلهٔ تمام‌شده رنگ تأخیر و برچسب نسبی نمی‌گیرد؛ فقط مرحلهٔ ناتمام رنگی می‌شود.
  assert.match(contentDetail, /const stageFinished = \['approved', 'completed', 'skipped'\]\.includes\(stage\.status\)/);
  assert.match(contentDetail, /const stageDeadlineTone = stageFinished \? 'later' : \(stageDeadline\?\.tier \?\? 'unknown'\)/);
  assert.match(contentDetail, /const stageDeadlineLabel = stageFinished \|\| !stageDeadline \? '' : deadlineRelativeLabel\(stageDeadline\)/);
  assert.match(contentDetail, /DEADLINE_CHIP_TONES\[stageDeadlineTone\]/);
  assert.match(contentDetail, /DEADLINE_ICON_TONES\[stageDeadlineTone\]/);
  assert.doesNotMatch(contentDetail, /DEADLINE_CHIP_TONES\[stageDeadline\.tier\]/);

  // سرور همان مهلت را به وضعیت مشتق تبدیل می‌کند و وضعیت پایانی را بازنویسی نمی‌کند
  assert.match(stageSync, /\$overdueStage => 'delayed'/);
  assert.match(stageSync, /\$finished === \$stages->count\(\) => 'ready_to_publish'/);
  assert.match(stageSync, /if \(! in_array\(\$content->status, \['published', 'archived', 'cancelled', 'suspended'\], true\)\)/);
  assert.match(stageSync, /\$payload\['nextStageDeadline'\] = \$nextStageDeadline;/);
  assert.match(statusPolicy, /'revising', 'delayed', 'approved'/);
  assert.deepEqual(
    (statusPolicy.match(/public const DERIVED = \[([^\]]+)\]/) || [])[1].replace(/'/g, '').split(', ').sort(),
    ['approved', 'delayed', 'planning', 'producing', 'published', 'ready_to_publish', 'reviewing', 'revising'],
  );

  // «تأخیر» در همهٔ لایه‌های نمایش و پالایه هست و دستی انتخاب نمی‌شود
  assert.match(types, /'revising' \| 'delayed' \| 'approving'/);
  assert.match(statusBadges, /delayed: 'border-violet-200 bg-violet-50 text-violet-700'/);
  assert.match(statusBadges, /delayed: 'در تأخیر'/);
  assert.match(listQuery, /delayed: 'در تأخیر'/);
  assert.match(appContext, /\{ id: 'delayed', label: 'در تأخیر', color: '#7c3aed', order: 6 \}/);
  assert.match(editContent, /\{status === 'delayed' && <option value="delayed" disabled>در تأخیر \(از مهلت مراحل\)<\/option>\}/);
  assert.match(delayedMigration, /'id' => self::DELAYED, 'label' => 'در تأخیر', 'color' => '#7c3aed'/);

  // هم‌گامی دوره‌ای: پیمایش محدود در فهرست/نمایش و دستور کرون بدون بازنویسی مهلت
  assert.match(contentController, /app\(ContentDeadlineSweep::class\)->refreshDue\(25\)/);
  assert.match(contentController, /app\(ContentDeadlineSweep::class\)->refresh\(\$content\)/);
  assert.match(deadlineSweep, /public const TERMINAL = \['published', 'archived', 'cancelled', 'suspended'\]/);
  assert.match(deadlineSweep, /where\('payload->nextStageDeadline', '<', \$today\)/);
  assert.match(consoleRoutes, /Schedule::command\('content:overdue-notifications'\)\s*\n\s*->hourly\(\)/);
  assert.match(consoleRoutes, /contents:refresh-deadline-status \{--limit=200\}/);
  // وضعیت مشتق در خلاصهٔ مجموعه هم گزارش می‌شود
  assert.match(backend('app/Http/Controllers/Api/V1/ContentSeriesController.php'), /'delayed' => \(int\) \(\$counts\['delayed'\] \?\? 0\)/);
  assert.match(seriesView, /پرونده در تأخیر مراحل جریان/);
});

test('the attachment count is computed on page load, not when the tab opens', () => {
  const queryStart = contentDetail.indexOf('const linkedContentAssets = useQuery({');
  assert.ok(queryStart > -1);
  const query = contentDetail.slice(queryStart, contentDetail.indexOf('React.useEffect(() => setWatching'));
  assert.match(query, /queryKey: \['content', content\?\.id, 'dam-assets'\]/);
  assert.ok(query.includes("enabled: Boolean(content?.id && !runtime.demoMode && /^\\d+$/.test(String(content?.id || '')))"), 'پرس‌وجوی پیوست‌ها با بارگذاری صفحه فعال می‌شود');
  assert.doesNotMatch(query, /activeTab === 'attachments'/);
  // شمار تب از دادهٔ همان پرس‌وجو می‌آید
  assert.match(contentDetail, /icon: Paperclip, count: linkedContentAssets\.data\?\.total \|\| damAssets\.length \|\| content\.attachments\?\.length \|\| 0/);
  // ورودی‌های هر مرحله کامل در کارت خودِ همان مرحله دیده می‌شوند (هیچ ورودی‌ای پنهان نمی‌شود)
  assert.match(contentDetail, /const isForwardedStageInput = \(input: ContentStageInput\): boolean =>\s*\n\s*Boolean\(input\.sourceStageId \|\| input\.sourceOutputId \|\| input\.forwardedAt \|\| input\.type === 'dependency_stage'\)/);
  assert.match(contentDetail, /const stageInputs = \(stage: ContentStage\): ContentStageInput\[\] => stage\.inputs \|\| \[\]/);
  assert.match(contentDetail, /const forwardedStageInputCount = \(stage: ContentStage\): number =>/);
  assert.match(contentDetail, /const workflowInputs = stages\.flatMap\(stage => stageInputs\(stage\)\.map\(input => \(\{ input, stageTitle: stage\.title \}\)\)\)/);
  assert.match(contentDetail, /const inputs = stageInputs\(stage\)/);
  assert.match(contentDetail, /const forwardedInputs = forwardedStageInputCount\(stage\)/);
  assert.match(contentDetail, /const inputItems = inputs\.map\(\(input, index\) => \(\{/);
  assert.match(contentDetail, /خروجی مرحله‌های قبل است که به این مرحله ارجاع شده و با برچسب «ارجاع‌شده» مشخص شده‌اند/);
  assert.doesNotMatch(contentDetail, /primaryStageInputs/);
  // نشان «ارجاع‌شده» روی خود کارت ورودی
  assert.match(stageAssets, /view\.kind === 'input' && view\.sourceStageId/);
  // وضعیت‌های ناشناختهٔ تنظیمات، ستون و تب خودشان را در فهرست می‌گیرند
  assert.match(contentList, /const statusColumns = \[\.\.\.kanbanColumns, \.\.\.unlistedStatusColumns\]/);
  assert.match(contentList, /\{statusColumns\.map\(status => <button key=\{status\.id\}/);
});
