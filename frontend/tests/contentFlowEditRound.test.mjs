import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * دور «هر پنج مورد»: ترتیب پیش‌فرض فهرست محتوا بر پایهٔ تاریخ انتشار، خطای ۴۲۲
 * هنگام تغییر جریان محتوا، حذف بخش‌های سیاست ارزیابی، ثبت‌نشدن خروجی فایل و
 * ویرایش‌نشدن جریان محتوا پس از شروع.
 *
 * این‌ها آزمون متن‌کد‌اند (مثل بقیهٔ tests/*.mjs): هر تغییر در شکل قرارداد همان
 * چیزی را نگه می‌دارند که سرور و مرورگر روی آن توافق کرده‌اند.
 */

const source = path => readFile(new URL(path, import.meta.url), 'utf8');
const backend = path => source(`../../backend/${path}`);

test('content list default order is publication date and it survives pagination', async () => {
  const [listQuery, list, request, controller] = await Promise.all([
    source('../src/routing/listQuery.ts'),
    source('../src/components/workspace/WorkspaceList.tsx'),
    backend('app/Http/Requests/WorkspaceListRequest.php'),
    backend('app/Http/Controllers/Api/V1/ContentController.php'),
  ]);

  // یک منبع واحد برای کلید پیش‌فرض: نه رشتهٔ پراکنده در چند فایل.
  assert.match(listQuery, /export const CONTENT_DEFAULT_SORT = 'publish_at';/);
  assert.match(listQuery, /module === 'contents' && sort === 'publish_at'\)\) result\.sort = sort;/);

  // ترتیب پیش‌فرض همیشه به سرور می‌رود: مرتب‌سازی سمت مرورگر روی صفحهٔ صفحه‌بندی‌شده
  // فقط ترتیب همان صفحه را عوض می‌کرد.
  assert.match(list, /const defaultSort = module === 'contents' \? CONTENT_DEFAULT_SORT : 'created_at';/);
  assert.match(list, /useWorkspacePage\(module, \{ \.\.\.filters, \.\.\.\(module === 'contents' \? \{ active_only: 1 \} : \{\}\), sort: filters\.sort \|\| defaultSort/);
  assert.match(list, /<option value="publish_at">تاریخ انتشار<\/option>/);
  assert.match(list, /value=\{filters\.sort \|\| defaultSort\}/);

  // سرور: کلید فقط برای مسیر contents مجاز است و ترتیب از payload خودِ پرونده
  // خوانده می‌شود (تاریخ انتشار ستون جدول نیست ⇒ بدون تغییر جدول‌ها).
  assert.match(request, /Rule::in\(\$module === 'contents'\s*\n?\s*\? \['created_at', 'updated_at', 'deadline', 'publish_at'\]/);
  assert.match(controller, /->when\(\$request->input\('sort'\) === 'publish_at', fn \(\$query\) => \$query->orderBy\(\s*\n?\s*'payload->publishInfo->date',/);
  assert.match(controller, /->when\(\$request->input\('sort'\) !== 'publish_at', fn \(\$query\) => \$query->orderBy\(/);
  assert.match(controller, /->orderBy\('id', \$request->input\('direction', 'desc'\)\)/);
});

test('a stored stage policy can never fail the flow save with 422', async () => {
  const [request, review, advanceMode] = await Promise.all([
    backend('app/Http/Requests/ContentRequest.php'),
    backend('app/Services/ContentReview.php'),
    backend('app/Support/Content/StageAdvanceMode.php'),
  ]);

  // مقادیر تاریخی حالت فعال‌سازی و سیاست ارزیاب پیش از اعتبارسنجی نگاشت می‌شوند؛
  // قاعدهٔ `Rule::in` دست‌نخورده می‌ماند و مقدار نامعتبر تازه رد می‌شود.
  assert.match(request, /protected function prepareForValidation\(\): void/);
  assert.match(request, /StageAdvanceMode::of\(\$mode\)/);
  assert.match(request, /\$stage\['reviewerStrategy'\] = 'stage_reviewer';/);
  assert.match(request, /\$this->merge\(\['stages' => \$normalized\]\);/);
  assert.match(advanceMode, /public const ALL = \[/);

  // فرادادهٔ حفاظت‌شده با مقایسهٔ متعارف سنجیده می‌شود: تفاوت نمایشی JSON
  // (رشته/عدد، null در برابر خالی) دیگر «تغییر» شمرده نمی‌شود، اما مقدار متفاوت
  // همان‌طور رد می‌شود.
  assert.match(review, /private function sameProtectedValue\(mixed \$left, mixed \$right\): bool/);
  assert.match(review, /private function canonicalProtectedValue\(mixed \$value\): mixed/);
  assert.match(review, /if \(! \$this->sameProtectedValue\(\$output\[\$field\] \?\? null, \$oldOutput\[\$field\] \?\? null\)\)/);
  assert.match(review, /if \(! \$this->sameProtectedValue\(\$input\[\$field\] \?\? null, \$oldInput\[\$field\] \?\? null\)\)/);
  assert.match(review, /if \(! \$this->sameProtectedValue\(\$stage\[\$field\] \?\? null, \$before\[\$field\] \?\? null\)\)/);
  assert.doesNotMatch(review, /\$stage\[\$field\] \?\? null\) !== \(\$before\[\$field\]/);
});

test('reviewer policy controls are gone from flow editors while stored values stay', async () => {
  const [modal, template, seriesForm, seriesView, model] = await Promise.all([
    source('../src/components/content/EditWorkflowModal.tsx'),
    source('../src/components/settings/ProcessTemplateModal.tsx'),
    source('../src/components/content/series/SeriesForm.tsx'),
    source('../src/components/content/ContentSeriesView.tsx'),
    backend('app/Services/ContentReview.php'),
  ]);

  // هیچ کنترلی سیاست ارزیاب را از رابط کاربری نمی‌نویسد…
  assert.doesNotMatch(modal, /سیاست تعیین ارزیاب/);
  assert.doesNotMatch(modal, /reviewerStrategy: event\.target\.value/);
  assert.doesNotMatch(template, /سیاست تعیین ارزیاب/);
  assert.doesNotMatch(template, /reviewerStrategy: event\.target\.value/);
  assert.doesNotMatch(seriesForm, /بر پایه سیاست قالب/);
  assert.doesNotMatch(seriesView, /بر پایه سیاست قالب/);

  // …اما مقدار ثبت‌شده دست‌نخورده در payload می‌ماند و قالب تازه مقدار پیش‌فرض
  // پشتیبانی‌شده را می‌فرستد؛ در نتیجه رفتار سرور عوض نمی‌شود.
  assert.match(template, /reviewerStrategy: 'stage_reviewer' as ReviewerStrategy,/);
  assert.match(modal, /reviewerStrategy: 'stage_reviewer' as ReviewerStrategy/);
  assert.match(model, /return \$stage\['reviewerId'\] \?\? \$stage\['approverId'\] \?\? \$content->payload\['approverId'\] \?\? \$content->owner_id;/);

  // انتخاب دستی ارزیاب روی خود انتخاب صریح می‌نشیند تا بی‌اثر نماند.
  assert.match(modal, /reviewerId: event\.target\.value,\s*\n\s*approverId: event\.target\.value,/);
});

test('registering a stage output pins the DAM version and checks the stage first', async () => {
  const [app, detail, relations, dam] = await Promise.all([
    source('../src/context/AppContext.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    backend('app/Services/ContentAssetRelations.php'),
    backend('app/Services/DamService.php'),
  ]);

  // نسخهٔ دارایی بخشی از قرارداد پیوند است و در هر دو شاخهٔ ثبت ذخیره می‌شود.
  assert.match(app, /assetVersionId: data\.assetVersionId \? String\(data\.assetVersionId\) : out\.assetVersionId,/);
  assert.match(app, /assetVersionNumber: data\.assetVersionNumber \?\? out\.assetVersionNumber/);
  assert.match(app, /id: outputId \|\| `out-\$\{Date\.now\(\)\}`,[\s\S]{0,600}assetVersionId: data\.assetVersionId \? String\(data\.assetVersionId\) : undefined,/);
  assert.match(detail, /assetVersionId: asset\.assetVersionId \? String\(asset\.assetVersionId\) : undefined,/);
  assert.match(dam, /'version_number' => 1,/);

  // مرحلهٔ هدف پیش از بارگذاری در مخزن بررسی می‌شود تا فایل بی‌صاحب نماند.
  assert.match(detail, /const targetStage = stages\.find\(stage => sameId\(stage\.id, selectedStageForDeliverable\.id\)\);/);
  assert.match(detail, /if \(!targetStage\) throw new Error\('[^']*'\);/);
  assert.match(detail, /contentBucket: 'outputs', relationRole: 'stage_output', stageId: targetStage\.id \}, targetStage\.title\)/);
  assert.match(detail, /const saved = await addStageDeliverable\(content\.id, targetStage\.id, `out-\$\{asset\.type\}-\$\{asset\.assetId\}`/);

  // خروجی‌ای که قبلاً به همین دارایی وصل بوده، مرجع تاریخی است: حذف دارایی از
  // مخزن نباید هر ذخیرهٔ بعدی جریان را با ۴۲۲ ببندد.
  assert.match(relations, /if \(! \$asset && is_array\(\$legacyOutput\)\) \{\s*\n\s*continue;\s*\n\s*\}/);
  assert.match(relations, /throw ValidationException::withMessages\(\['stages' => 'دارایی خروجی انتخابی در دسترس نیست\.'\]\);/);
});

test('a started flow stays editable for workflow managers while decisions stay server-owned', async () => {
  const [review, modal] = await Promise.all([
    backend('app/Services/ContentReview.php'),
    source('../src/components/content/EditWorkflowModal.tsx'),
  ]);

  // ورود به وضعیت تصمیم برای همه بسته است…
  assert.match(review, /'stages' => 'تأیید یا رد را از فرمان بررسی مرحله انجام دهید\.'/);
  assert.match(review, /\$enteringDecision = in_array\(\$stage\['status'\] \?\? '', \['approved', 'revisions_needed', 'needs_revision'\], true\);/);
  // …اما مدیر گردش کار می‌تواند وضعیت سرگردان را اصلاح کند و ارزیاب مرحلهٔ در
  // حال بررسی را جانشین کند (تسک بررسی هم به ارزیاب تازه منتقل می‌شود).
  assert.match(review, /\$leavingReviewOrDecision = in_array\(\$before\['status'\] \?\? '', \[\.\.\.self::WAITING, 'approved'\], true\);/);
  assert.match(review, /\$blockedStatusChange = \$changed && ! \$normalizingDisabledReview\s*\n\s*&& \(\$enteringDecision \|\| \(\$leavingReviewOrDecision && ! \$canConfigure\)\);/);
  assert.match(review, /if \(\$content && ! \$canConfigure && in_array\(\$before\['status'\] \?\? '', self::WAITING, true\)\) \{/);
  assert.match(review, /'تغییر ساختار یا مسئول مرحله نیازمند مجوز مدیریت جریان محتواست\.'/);
  // «مدیر محتوا» فقط جانشینی مسئول/ارزیاب همان مرحله را دارد؛ ساختار همچنان
  // پشت مجوز مدیریت جریان می‌ماند.
  assert.match(review, /public function canAssignStagePeople\(User \$actor\): bool/);
  assert.match(review, /\$actor->role\?->key === 'content_manager'/);

  // پنجرهٔ ویرایش هم همان قواعد را از پیش می‌داند: وضعیت چرخهٔ بررسی قفل
  // می‌شود، تصمیم‌ها در فهرست نمی‌آیند و مهر نسخه همراه ذخیره می‌رود.
  assert.match(modal, /const reviewCycleStatuses: ContentStageStatus\[\] = \['ready_for_review', 'pending_approval', \.\.\.decisionStatuses\];/);
  assert.match(modal, /const statusLocked = \(stage: ContentStage\) => reviewCycleStatuses\.includes\(stage\.status\);/);
  assert.match(modal, /const statusOptionsFor = \(stage: ContentStage\) => stageStatuses\.filter\(option =>\s*\n\s*!decisionStatuses\.includes\(option\.id\) \|\| option\.id === stage\.status\);/);
  assert.match(modal, /\.\.\.\(baseline\?\.version\?\.length === 64 \? \{ reviewVersion: baseline\.version \} : \{\}\),/);
  assert.match(modal, /const saved = await updateContent\(content\.id, \{/);
  assert.match(modal, /setError\(failure\s*\n\s*\? apiErrorMessage\(failure, 'ذخیرهٔ جریان محتوا انجام نشد؛ دوباره تلاش کنید\.'\)/);
});
