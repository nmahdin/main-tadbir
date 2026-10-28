import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * اصلاح‌های این دور:
 * ۱) مدال ثبت خروجی یک نوار پیمایش دارد (بدنه)، نه دو تا؛ کادر مدال اسکرول و دستهٔ تغییر اندازه ندارد.
 * ۲) ثبت خروجی متنی: متن بلند آزاد است و می‌توان به متن خروجی قبلی افزود.
 * ۳) جریان محتوا با صفر مرحله هم ذخیره می‌شود.
 * ۴) خودکارسازی: قاعدهٔ تازه پیش‌فرض فعال است و محرک با همان قاعدهٔ سرور نرمال می‌شود.
 */
test('مدال: فقط بدنه اسکرول می‌شود و کادر مدال نوار پیمایش/تغییر اندازه ندارد', async () => {
  const [primitives, css, composer, detail, workflow] = await Promise.all([
    source('../src/components/common/Primitives.tsx'),
    source('../src/index.css'),
    source('../src/components/common/AttachmentComposer.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/EditWorkflowModal.tsx'),
  ]);

  // کادر مدال: ستون انعطاف‌پذیر با overflow-hidden؛ بدنه یک ناحیهٔ پیمایش دارد.
  assert.match(primitives, /className=\{`ui-modal flex flex-col overflow-hidden bg-white/);
  assert.doesNotMatch(primitives, /panelScroll \? 'overflow-auto' : 'overflow-hidden'/);
  assert.match(primitives, /<div data-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">\{children\}<\/div>/);
  // دستهٔ تغییر اندازهٔ متن داخل مدال حذف شده است.
  assert.match(css, /\.ui-modal textarea \{ resize: none; \}/);
  // فهرست پیوست‌ها دیگر ناحیهٔ پیمایش دوم نمی‌سازد.
  assert.doesNotMatch(composer, /max-h-72 space-y-2 overflow-y-auto/);
  // دو مدالِ خروجی و جریان، اسکرول درونی و ارتفاع ثابت نداشته‌اند.
  assert.doesNotMatch(detail, /max-h-\[calc\(94dvh-74px\)\]/);
  assert.doesNotMatch(workflow, /max-h-\[calc\(94dvh-74px\)\]/);
  assert.match(detail, /<footer className="sticky bottom-0 z-10 flex shrink-0/);
  assert.match(workflow, /<footer className="sticky bottom-0 z-10 flex shrink-0/);
});

test('ثبت خروجی متنی: متن بلند و افزودن به خروجی قبلی در هر دو مدال', async () => {
  const [detail, modal] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/workspace/ContentStageOutputModal.tsx'),
  ]);

  for (const file of [detail, modal]) {
    // ورودی متن خروجی با سقف بلند و شمارندهٔ نویسه.
    assert.match(file, /maxLength=\{20000\}/);
    assert.match(file, /متن خروجی قبلی/);
  }

  // مدال صفحهٔ محتوا: عنوان اجباری نیست و افزودن به خروجی قبلی همان شناسه را به‌روز می‌کند.
  assert.match(detail, /const \[deliverableAppendTo, setDeliverableAppendTo\] = useState<string \| null>\(null\)/);
  assert.match(detail, /if \(!draftCount && !deliverableTitle\.trim\(\) && !deliverableNotes\.trim\(\) && !deliverableUrl\.trim\(\)\)/);
  assert.match(detail, /await addStageDeliverable\(content\.id, targetStage\.id, deliverableAppendTo, \{/);
  // مسیر پیش‌فرض «یادداشت» برای خروجیِ بدون فایل دست‌نخورده مانده است.
  assert.match(detail, /const saved = await addStageDeliverable\(content\.id, targetStage\.id, `out-note-\$\{Date\.now\(\)\}`, note\);/);

  // مدال کارتابل: همان رفتار با شناسهٔ خروجی موجود.
  assert.match(modal, /const \[appendTo, setAppendTo\] = useState<string \| null>\(null\)/);
  assert.match(modal, /await addStageDeliverable\(contentId, stage\.id, appendTo, \{/);
  assert.match(modal, /sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between/);
});

test('جریان محتوا: با صفر مرحله هم ذخیره می‌شود', async () => {
  const workflow = await source('../src/components/content/EditWorkflowModal.tsx');

  assert.doesNotMatch(workflow, /disabled=\{busy \|\| stages\.length === 0\}/);
  assert.doesNotMatch(workflow, /جریان محتوا باید حداقل یک مرحله داشته باشد/);
  assert.match(workflow, /همهٔ مرحله‌ها حذف شده‌اند\. ذخیره، جریان را بدون مرحله نگه می‌دارد/);
});

test('خودکارسازی: قاعدهٔ تازه فعال است و محرک پیش از ذخیره نرمال می‌شود', async () => {
  const panel = await source('../src/components/bale/BaleAutomationsPanel.tsx');

  assert.match(panel, /id: crypto\.randomUUID\(\), name: '', enabled: true,/);
  assert.match(panel, /const normalizeTrigger = \(trigger: string, type: BaleRule\['trigger_type'\]\) => \{/);
  assert.match(panel, /trigger: normalizeTrigger\(trigger, editing\.trigger_type\)/);
  // هشدار روشن وقتی هیچ قاعده‌ای فعال نیست و شمارندهٔ قاعده‌های فعال.
  assert.match(panel, /هیچ قاعده‌ای فعال نیست؛ به همین دلیل بات به متن‌ها و فرمان‌ها پاسخی نمی‌دهد/);
  assert.match(panel, /rule\.enabled\)\.length\.toLocaleString\('fa-IR'\)\} فعال/);
  // سوییچ فعال‌سازی داخل فرم ویرایش.
  assert.match(panel, /این قاعده در بات فعال باشد/);
  // ۴۰۹ قفلِ کوتاه‌مدتِ بات با «نسخهٔ قدیمی» اشتباه گرفته نمی‌شود.
  assert.match(panel, /\/شخص دیگری\|revision\|نسخه\/iu\.test\(message\)/);
});

test('بات: دکمهٔ ثبت خروجی در اعلان، متن چندبخشی و فرمان ناشناخته', async () => {
  const [outputs, delivery, automations, router, lock] = await Promise.all([
    source('../../backend/app/Bot/Bale/Handlers/ContentStageOutputs.php'),
    source('../../backend/app/Bot/Bale/Notifications/NotificationDelivery.php'),
    source('../../backend/app/Bot/Bale/Automations.php'),
    source('../../backend/app/Bot/Bale/Routing/MenuRouter.php'),
    source('../../backend/app/Bot/Bale/Support/RuntimeLock.php'),
  ]);

  // اعلان وظیفهٔ تازهٔ محتوا: دکمهٔ pubout به اعلان وصل می‌شود.
  assert.match(outputs, /public function notificationRows\(User \$user, DomainRecord \$record\): array/);
  assert.match(outputs, /'callback_data' => 'pubout:'\.\$task->id/);
  assert.match(delivery, /app\(ContentStageOutputs::class\)->notificationRows\(\$user, \$record\)/);

  // متن خروجی چندبخشی + افزودن به خروجی قبلی.
  assert.match(outputs, /public const TOTAL_CHARS = 20000;/);
  assert.match(outputs, /'callback_data' => 'outdone:'\.\$session->nonce/);
  assert.match(outputs, /'callback_data' => 'outmore:'\.\$session->nonce/);
  assert.match(outputs, /'puboutadd:'\.\$task->id/);
  assert.match(outputs, /private function textOutputOf\(array \$stage\): \?array/);
  assert.match(outputs, /return '✅ متن به خروجیِ قبلی همین مرحله افزوده شد/);

  // نرمال‌سازی محرک: نام ربات و نویسه‌های نامرئی.
  assert.ok(automations.includes('(/[^\\s@]+)'));
  assert.ok(automations.includes('@\\S+~u'));
  assert.match(automations, /\\x\{200B\}-\\x\{200F\}/);
  assert.match(automations, /\$this->normalize\(\(string\) \$rule\['trigger'\]\) === \$trigger/);

  // فرمان ناشناخته: پاسخ روشن به‌جای پیام خوش‌آمدگویی.
  assert.match(router, /این فرمان در خودکارسازی ربات تعریف نشده است/);

  // قفل کوتاه‌مدت بات، ذخیرهٔ تنظیمات را با ۴۰۹ فوری نمی‌بندد.
  assert.match(lock, /\$lock->block\(5\)/);
});
