import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('ثبت خروجی مرحله برای مسئول، مدیر پرونده و دارندهٔ مجوز ویرایش/مدیریت جریان باز است', async () => {
  const [detail, review] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../../backend/app/Services/ContentReview.php'),
  ]);

  // دامنهٔ مجاز همان دامنه‌ای است که سرور می‌پذیرد: مسئول مرحله، مدیر پرونده،
  // مدیر سامانه، دارندهٔ «مدیریت جریان محتوا» و هر کس سرور ویرایش را برایش مجاز دانسته.
  assert.match(detail, /const canDepositOutput = \(stage: ContentStage\): boolean =>/);
  assert.match(detail, /sameId\(currentUser\.id, stage\.assigneeId\)\s*\|\| sameId\(currentUser\.id, content\.ownerId\)/);
  assert.match(detail, /hasPermission\('content\.workflow\.manage'\)/);
  assert.match(detail, /\(content\.access\?\.edit \?\? hasPermission\('content\.edit'\)\);/);
  // ترتیب دقیق تابع‌ها سنجیده نمی‌شود؛ فقط وجود هر دو تابع مهم است.
  assert.ok(detail.includes('const saveOutputText = async (view: StageAssetView, plainText: string) => {'));
  assert.ok(detail.includes('const runStageAction = async (key: string, action: () => Promise<unknown>) => {'));
  // همان پرچم برای دکمهٔ «ثبت خروجی جدید» و حذف خروجی استفاده می‌شود (نه مسئول‌محور صرف).
  assert.ok(detail.includes('action={canDepositOutput(stage)'));
  assert.ok(detail.includes('{canDepositOutput(stage) && !output.forwardedToStageId &&'));
  assert.doesNotMatch(detail, /action=\{sameId\(currentUser\.id, stage\.assigneeId\)/);

  // «افزودن خروجی» جزو فیلدهای ساختاری گارد سرور نیست؛ پس مدیر محتوا می‌تواند خروجی بگذارد.
  const structuralFields = review.match(/public const STRUCTURAL_FIELDS = \[[\s\S]{0,400}?\];/);
  assert.ok(structuralFields, 'STRUCTURAL_FIELDS not found');
  assert.doesNotMatch(structuralFields[0], /'outputs'/);
});

test('ثبت خروجی به مجوز بارگذاری در مخزن یا سلامت آن گره نمی‌خورد', async () => {
  const [detail, context, composer] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/context/AppContext.tsx'),
    source('../src/components/common/AttachmentComposer.tsx'),
  ]);

  // ثبت پیوند/یادداشت خروجی، بدون ساخت دارایی در مخزن.
  assert.ok(detail.includes('const saved = await addStageDeliverable(content.id, targetStage.id, `out-note-${Date.now()}`, note);'));
  assert.ok(detail.includes("if (!stored) {"));
  // اگر ساخت دارایی متنی مخزن شکست خورد، خروجی در خود جریان ثبت می‌شود.
  assert.match(detail, /console\.warn\('Creating the text asset for the stage output failed; keeping the output inside the flow\.', assetError\);/);
  // بدون مجوز بارگذاری، پیش از هر تلاشی مسیر جایگزین گفته می‌شود.
  assert.ok(detail.includes("const canUploadToDam = hasPermission('assets.upload');"));
  assert.match(detail, /if \(draftCount && !canUploadToDam\) \{/);
  assert.ok(detail.includes('مجوز بارگذاری در مخزن مرکزی برای شما فعال نیست'));

  // نسخهٔ دارایی بخشی از قرارداد ثبت خروجی است و در هر دو شاخه (افزودن/به‌روزرسانی) می‌ماند.
  assert.ok(context.includes('assetVersionId: data.assetVersionId ? String(data.assetVersionId) : out.assetVersionId,'));
  assert.ok(context.includes('assetVersionId: data.assetVersionId ? String(data.assetVersionId) : undefined,'));
  assert.ok(detail.includes('assetVersionId: asset.assetVersionId ? String(asset.assetVersionId) : undefined,'));

  // شناسهٔ مرحله پیش از بارگذاری در مخزن بررسی می‌شود تا فایل بی‌صاحب نماند.
  assert.ok(detail.includes("if (!targetStage) throw new Error('مرحلهٔ انتخابی دیگر در جریان این پرونده نیست؛ صفحه را تازه کنید و از مرحلهٔ فعلی خروجی ثبت کنید.');"));
  assert.ok(detail.includes("const persisted = draftCount\n        ? await persistAttachmentDraft(deliverableDraft, { contentId: content.id"));
  // سازندهٔ ضمیمه، مرحله و نقش رابطه را می‌فرستد؛ همین قرارداد در سرور اعتبارسنجی می‌شود.
  assert.ok(composer.includes("['stage_id', relations.stageId],"));
  assert.ok(composer.includes("['relation_role', relations.relationRole],"));
  assert.ok(composer.includes("['content_bucket', relations.contentBucket],"));
});

test('دلیل انجام‌نشدن اقدام‌های جریان محتوا روی همان صفحه نوشته می‌شود', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');

  // وضعیت و پنل دلیل، در تب فرایند تولید.
  assert.ok(detail.includes('const [stageActionFailure, setStageActionFailure] = useState<{ key: string; title: string; message: string } | null>(null);'));
  assert.match(detail, /\{stageActionFailure && \(\n              <div role="alert"/);
  assert.ok(detail.includes('بستن'));
  assert.ok(detail.includes("const reportStageActionFailure = (key: string, message: string) => {"));

  // چهار دلیل ممکن: نبود مجوز ویرایش، نبود مسئول، پیش‌نیاز ناتمام و اقدام در جریان.
  assert.ok(detail.includes("const editRefusal = (): string => (content.access?.edit ?? hasPermission('content.edit'))"));
  assert.ok(detail.includes("const assigneeRefusal = (stage: ContentStage, action: string): string => {"));
  assert.ok(detail.includes('const prerequisiteRefusal = (stage: ContentStage): string => {'));
  assert.ok(detail.includes('const waiting = stageWaitingReason(stages, stage);'));
  assert.ok(detail.includes("'یک اقدام دیگر همین حالا در جریان است؛ پس از پایان آن دوباره تلاش کنید.'"));

  // دلیل‌ها در دکمه‌ها: هم در حالت آماده‌نبودن و هم در مقدار عنوان.
  assert.ok(detail.includes('const stageBusyReason = stageActionKey'));
  assert.match(detail, /title=\{stageBusyReason \|\| \(sameId\(currentUser\.id, stage\.assigneeId\)/);
  assert.match(detail, /title=\{stageBusyReason \|\| \(stage\.reviewRequired === false/);
  assert.ok(detail.includes("title={stageBusyReason || 'شروع اصلاحات'}"));

  // دیگر هیچ اقدام جریان با alert بی‌توضیح رد نمی‌شود.
  assert.doesNotMatch(detail, /alert\('فقط مسئول این مرحله/);
  assert.doesNotMatch(detail, /alert\(stage\.reviewRequired === false \? 'فقط مسئول این مرحله/);

  // خطای پرتاب‌شده یا پاسخ ناموفق سرور، متن واقعی خودش را نشان می‌دهد.
  assert.match(detail, /catch \(error\) \{\n      \/\/ خطای پرتاب‌شده[\s\S]{0,200}reportStageActionFailure\(key, apiErrorMessage\(error, 'اقدام انجام نشد؛ پیام خطا را بررسی کنید\.'\)\);/);
  assert.match(detail, /if \(result === false\) \{\n        reportStageActionFailure\(key, commandFailure\(/);

  // «نیازمند اصلاح» هم در سکوت رد نمی‌شود و دلیلش در همان پنجره دیده می‌شود.
  assert.ok(detail.includes('const [rejectError,setRejectError]=useState(\'\');'));
  assert.ok(detail.includes("setRejectError(commandFailure('ثبت بازبینی انجام نشد؛ وضعیت مرحله و ارزیاب آن را بررسی کنید.'));"));
  assert.match(detail, /\{rejectError && <p role="alert"/);

  // انتظار تصمیم ارزیاب، نام ارزیاب و مسیر رفع را می‌گوید (پیش‌تر مبهم بود).
  assert.ok(detail.includes('const stageReviewer = users.find(user => sameId(user.id, stage.reviewerId || stage.approverId || content.approverId || content.ownerId));'));
  assert.match(detail, /در انتظار تصمیم ارزیاب «\$\{stageReviewer\.name\}» برای این مرحله/);
  assert.ok(detail.includes('ارزیاب این مرحله مشخص نشده است؛ از «ویرایش جریان و مراحل»'));
});
