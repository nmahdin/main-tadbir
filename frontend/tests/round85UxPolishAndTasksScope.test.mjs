import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * دور ۸۵ — یکدست‌سازی رابط و چند اصلاح رفتاری.
 *
 * این تست‌ها همان قراردادهای ظاهری/رفتاری این دور را قفل می‌کنند: جای‌گذاری
 * فهرست انتخابگر، جانمای ویدیو، نشانگر لودینگ دکمه‌های ذخیره، دکمهٔ پروفایل،
 * تسک‌های تکمیل‌شدهٔ یک پرونده، دکمه‌های کارت خروجی، آیکون و برچسب نوع فایل،
 * متن وضعیت مرحله، سایهٔ تب فعال و هشدار متنِ اضافه‌نشده در ضمیمه‌ها.
 */

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const backend = (path) => readFileSync(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

const selectLayer = source('components/common/CustomSelectLayer.tsx');
const player = source('components/common/MediaPlayer.tsx');
const navbar = source('components/layout/TopNavbar.tsx');
const detail = source('components/content/ContentDetailView.tsx');
const stages = source('components/content/StageAssetSections.tsx');
const composer = source('components/common/AttachmentComposer.tsx');
const css = source('index.css');
const workflowLabels = source('utils/contentWorkflow.ts');
const taskController = backend('app/Http/Controllers/Api/V1/TaskController.php');

test('فهرست انتخابگر هرگز بیرون از قاب دید باز نمی‌شود و در صورت نیاز بالای فیلد می‌آید', () => {
  // جای‌گذاری بر پایهٔ فضای واقعی بالا/پایین، با ارتفاع دقیق (نه حداقل ۱۲۰px).
  assert.match(selectLayer, /const above = spaceBelow < needed && spaceAbove > spaceBelow;/);
  assert.match(selectLayer, /const height = Math\.max\(Math\.min\(needed, available\), MIN_MENU_HEIGHT\);/);
  assert.match(selectLayer, /top: Math\.max\(MENU_MARGIN, Math\.min\(top, window\.innerHeight - clampedHeight - MENU_MARGIN\)\)/);
  // دیگر با `translateY(-100%)` جابه‌جا نمی‌شود؛ همان مختصات محاسبه‌شده اعمال می‌شود.
  assert.doesNotMatch(selectLayer, /transform: position\.above \? 'translateY\(-100%\)'/);
  assert.match(selectLayer, /data-placement=\{position\.above \? 'above' : 'below'\}/);
  // ارتفاع سرگروه‌ها هم در فضای لازم شمرده می‌شود.
  assert.match(selectLayer, /ITEM_GROUP_HEIGHT/);
});

test('جانمای ویدیو یکی است و پیام لودینگ در مرکز می‌نشیند', () => {
  assert.match(player, /data-video-placeholder="single"/);
  assert.match(player, /className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-4 text-center"/);
  // اسکلتِ گردگوشهٔ داخلی (که «جانمای دوم» دیده می‌شد) حذف شده است.
  assert.doesNotMatch(player, /ui-skeleton h-full w-full absolute inset-0/);
  assert.match(player, /در حال آماده‌سازی ویدیو…/);
});

test('دکمهٔ ذخیرهٔ مدال‌ها هنگام کلیک نشانگر لودینگ نشان می‌دهد', () => {
  // دکمهٔ مشترک سامانه: نشانگر + غیرفعال‌شدن خودکار.
  const primitives = source('components/common/Primitives.tsx');
  assert.match(primitives, /\{loading && <LoaderCircle aria-hidden className="w-4 h-4 animate-spin" \/>\}/);
  // مدال‌های API-محور با همان وضعیت ذخیره، نشانگر می‌گیرند.
  const expectations = [
    ['components/content/ContentDetailView.tsx', /loading=\{isSavingDeliverable\}/, /loading=\{stageActionKey === `submit:/],
    ['components/templates/TemplateEditorModal.tsx', /submitting && <LoaderCircle className="w-4 h-4 animate-spin"/],
    ['components/templates/TemplatesModal.tsx', /saving && <LoaderCircle className="w-4 h-4 animate-spin"/],
    ['components/settings/ProcessTemplateModal.tsx', /saving \? <LoaderCircle className="w-4 h-4 animate-spin"/],
    ['components/thought-room/CreateIdeaModal.tsx', /isSubmitting \? <LoaderCircle className="w-4 h-4 animate-spin"/],
    ['components/thought-room/CreateMeetingModal.tsx', /isSubmitting \|\| isCreatingMeet \? <LoaderCircle className="w-4 h-4 animate-spin"/],
    ['components/thought-room/MeetingMinutesModal.tsx', /saving \? <LoaderCircle className="w-4 h-4 animate-spin"/],
  ];
  for (const [file, ...patterns] of expectations) {
    const content = source(file);
    for (const pattern of patterns) assert.match(content, pattern, file);
  }
});

test('دکمهٔ منوی پروفایل در سربرگ کپسولی نیست', () => {
  assert.match(navbar, /className="ui-tap flex shrink-0 items-center gap-2 rounded-xl border border-transparent p-1 pr-1\.5 transition-colors hover:bg-slate-100"/);
  assert.doesNotMatch(navbar, /rounded-full border border-transparent p-1 pr-1\.5/);
});

test('تب «تسک‌های مربوط» همهٔ وظایف همان پرونده، از جمله انجام‌شده‌ها، را نشان می‌دهد', () => {
  // دامنهٔ محتوا فقط وقتی مجوز دیدن همان محتوا هست، فیلتر «مسئول من» را برمی‌دارد.
  assert.match(taskController, /\$contentScope = \$request->integer\('content_id'\);/);
  assert.match(taskController, /app\(ContentAccess::class\)->canView\(\$request->user\(\), \$content\)/);
  assert.match(taskController, /->when\(! \$contentTasksVisible, fn \(\$query\) => \$query->where\('assignee_id', \$request->user\(\)->id\)\)/);
});

test('دکمه‌های خروجی (پیش‌نمایش/تأیید/اصلاح) با دکمه‌های سامانه یکپارچه‌اند', () => {
  // پیش‌نمایش کارت خروجی: همان Button استاندارد، نه دکمهٔ دست‌ساز.
  assert.match(stages, /<Button variant="secondary" onClick=\{\(\) => onPreview\(view\)\} title="پیش‌نمایش این خروجی"><Eye className="h-4 w-4" aria-hidden \/>پیش‌نمایش<\/Button>/);
  assert.match(stages, /import \{ Button, Modal \} from '\.\.\/common\/Primitives';/);
  // دکمه‌های مرحله: شروع/ارسال/تأیید/اصلاح با Button و نشانگر لودینگ.
  assert.match(detail, /<Button\s+variant="primary"\s+loading=\{stageActionKey === `start:\$\{stage\.id\}`\}/);
  assert.match(detail, /variant=\{stage\.reviewRequired === false \? 'success' : 'primary'\}[\s\S]{0,120}?loading=\{stageActionKey === `submit:\$\{stage\.id\}`\}/);
  assert.match(detail, /<Button variant="primary" loading=\{stageActionKey === `approve:\$\{stage\.id\}`\}/);
  assert.match(detail, /<Button variant="danger"[\s\S]{0,400}?نیازمند اصلاح<\/Button>/);
  assert.match(detail, /<Button\s+variant="warning"\s+loading=\{stageActionKey === `revise:\$\{stage\.id\}`\}/);
});

test('آیکون کارت خروجی با نوع فایل هم‌خوان است و برچسب «فایل» فرمت را نشان می‌دهد', () => {
  // آیکون اختصاصی متن/تصویر/ویدیو/صدا و قالب‌های اداری.
  assert.match(stages, /export const stageAssetVisualKind = \(view: StageAssetView\): StageAssetVisualKind => \{/);
  assert.match(stages, /if \(isImageView\(view\)\) return 'image';/);
  assert.match(stages, /\.\(mp4\|mov\|webm\|mkv\|avi\|m4v\|mpeg\|mpg\)/);
  assert.match(stages, /\.\(mp3\|wav\|m4a\|ogg\|oga\|aac\|flac\|opus\)/);
  assert.match(stages, /if \(view\.outputType === 'text' \|\| mime\.startsWith\('text\/'\)/);
  // برچسب نوع: فرمت واقعی فایل، و اگر فقط MIME بود، زیرنوع آن.
  assert.match(stages, /const subtype = mime\.split\('\/'\)\[1\]\?\.split\(';'\)\[0\]\?\.trim\(\);/);
  assert.match(stages, /if \(subtype\) \{/);
  // نام و قالب فایل از دارایی مخزن تکمیل می‌شود (بدون درخواست تازه).
  assert.match(detail, /const assetMeta = \(assetId\?: string\) => \{/);
  assert.match(detail, /fileName: base\.fileName \|\| meta\?\.fileName, mimeType: base\.mimeType \|\| meta\?\.mimeType/);
});

test('متن وضعیت مرحلهٔ در انتظار بررسی کوتاه و یکدست است', () => {
  assert.match(detail, /<FileCheck className="w-3\.5 h-3\.5" \/> در انتظار بررسی<\/span>/);
  assert.doesNotMatch(detail, /در انتظار بررسی مدیر/);
  assert.match(workflowLabels, /ready_for_review: 'در انتظار بررسی',/);
  assert.match(workflowLabels, /pending_approval: 'در انتظار بررسی',/);
});

test('تب فعال در همهٔ نوارهای تب یک سایهٔ بسیار کم دارد', () => {
  assert.match(css, /\[role="tab"\]\[aria-selected="true"\],\s*\n\[role="tab"\]\[data-state="active"\] \{\s*\n  box-shadow: 0 1px 2px rgb\(15 23 42 \/ 0\.08\)/);
  // قاعدهٔ «تب‌ها تخت بمانند» هنوز برای تب‌های غیرفعال برجاست.
  assert.match(css, /\[role='tab'\],\s*\n\[role='tablist'\] > button,/);
});

test('متن یادداشتِ اضافه‌نشده پیش از ذخیره هشدار می‌دهد', () => {
  assert.match(composer, /const pendingText = !disabled && \(Boolean\(draftTitle\.trim\(\)\) \|\| hasRichTextContent\(draftBody\)\);/);
  assert.match(composer, /const form = rootRef\.current\?\.closest\('form'\);/);
  assert.match(composer, /form\.addEventListener\('submit', guard, true\);/);
  assert.match(composer, /event\.preventDefault\(\);/);
  assert.match(composer, /متن یادداشت هنوز به فهرست اضافه نشده است/);
  assert.match(composer, /این متن هنوز به فهرست اضافه نشده است؛ با «افزودن به فهرست» ثبتش کنید/);
});
