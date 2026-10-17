import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('content list keeps the system palette, stage progress and series name without a type dot', async () => {
  const [list, badges, mainView] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/utils/statusBadges.tsx'),
    source('../src/components/content/ContentMainView.tsx'),
  ]);

  // رنگ کلی فهرست با سامانه یکدست شده است (نیلی) و هیچ لهجهٔ بنفش اختصاصی نمانده
  assert.doesNotMatch(list, /violet/);
  assert.match(list, /icon: PenTool,\s*\n\s*iconBox: 'bg-indigo-600 shadow-indigo-200',/);
  assert.match(list, /className="ui-form-action px-4 py-2\.5 rounded-xl bg-indigo-600/);
  assert.match(list, /\$\{active \? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'\}/);

  // نوار پیشرفت زیر وضعیت، فقط از مرحله‌های واقعی پرونده
  assert.match(list, /const COMPLETED_STAGE_STATUSES = \['completed', 'approved', 'skipped'\];/);
  assert.match(list, /const contentProgressOf = \(row: any\) => \{/);
  assert.match(list, /const percentage = total \? Math\.round\(\(done \/ total\) \* 100\) : 0;/);
  assert.match(list, /جریان تولید برای این پرونده تعریف نشده است/);
  assert.match(list, /aria-label=\{`پیشرفت جریان محتوا \$\{progress\.percentage\} درصد`\}/);
  assert.match(list, /مرحله \{progress\.current\.toLocaleString\('fa-IR'\)\} از \{progress\.total\.toLocaleString\('fa-IR'\)\}/);
  assert.match(list, /module === 'contents' \? <div className="min-w-0">\{statusBadge\(module, row, labels\)\}<ContentProgressBar row=\{row\} \/><\/div>/);
  assert.equal(list.match(/<ContentProgressBar row=\{row\} \/>/g)?.length, 2, 'نوار پیشرفت در نمای فهرست و کارت');

  // نام مجموعه زیر عنوان؛ پروندهٔ بدون مجموعه «عمومی» است
  assert.match(list, /return row\.seriesName \|\| 'عمومی';/);

  // نشانگر نوع محتوا با رنگ خودِ نوع و بدون نقطه
  assert.match(list, /<ContentTypeBadge color=\{typeOf\(row\)\?\.color\} label=\{typeNameOf\(row\)\} \/>/);
  assert.doesNotMatch(list, /w-2 h-2 rounded-full" style=\{\{ backgroundColor: app\.contentTypes/);
  assert.match(badges, /export const contentTypeBadgeColor = \(color\?: string \| null, fallback = '#4f46e5'\): string =>/);
  assert.match(badges, /backgroundColor: `\$\{tone\}14`, borderColor: `\$\{tone\}38`/);
  const badgeComponent = badges.match(/export const ContentTypeBadge[\s\S]*?\n\);/)?.[0] || '';
  assert.ok(badgeComponent.length > 0, 'نشانگر مشترک نوع محتوا باید وجود داشته باشد');
  assert.doesNotMatch(badgeComponent, /rounded-full|w-2 h-2|h-2 w-2/);

  // نمایشگرهای دمو هم از همان پیاده‌سازی رنگ نوع محتوا استفاده می‌کنند (بدون کد تکراری)
  assert.match(mainView, /const typeBadgeStyle = \(typeId: string\) => contentTypeBadgeStyle\(contentTypes\.find\(type => type\.id === typeId\)\?\.color\);/);
  assert.doesNotMatch(mainView, /backgroundColor: `\$\{color\}14`/);
});

test('the DAM entry modal reuses the shared attachment composer with server-authoritative duplicate policy', async () => {
  const [library, composer, controller] = await Promise.all([
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/common/AttachmentComposer.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
  ]);

  // همان الگوی بخش ضمیمه‌ها: مدال مشترک + سازندهٔ ضمیمه + ثبت یک‌جا
  assert.match(library, /<Modal open onClose=\{onClose\} title="افزودن دارایی جدید"/);
  // سازندهٔ مشترک ضمیمه با همان props؛ «linkTarget» زمینهٔ اتصال ردیف جدول است.
  assert.match(library, /<AttachmentComposer value=\{draft\} onChange=\{setDraft\} disabled=\{busy\} title="دارایی‌های این ثبت" defaultFolderLabel=\{folderLabelOf\(currentFolderId\)\} allowDirectoryUpload linkTarget=\{\{ taskId: taskId \|\| undefined, contentId: contentId \|\| undefined \}\} \/>/);
  assert.match(library, /const saved = await persistAttachmentDraft\(/);
  assert.match(library, /const count = attachmentDraftCount\(draft\);/);
  assert.match(library, /relationRole: 'attachment',/);
  assert.match(library, /contentBucket: linkedContentId \? 'attachments' : undefined,/);
  assert.match(library, /disabled=\{count === 0\}>ثبت \{count\.toLocaleString\('fa-IR'\)\} مورد در مخزن/);

  // مسیر بارگذاری اختصاصی و تکراری مدال قبلی حذف شده است
  assert.doesNotMatch(library, /uploadOne|QueueItem|displayTitle/);
  assert.doesNotMatch(library, /xhr\.open\('POST', `\$\{apiConfig\.baseUrl\}\/dam\/library`\)/);

  // فرادادهٔ مخزن از راه قرارداد مشترک به سرور می‌رود
  assert.match(library, /defaults: \{[\s\S]{0,240}categoryId: categoryId \|\| undefined,[\s\S]{0,160}confidentiality,[\s\S]{0,160}status: canSetStatus && status \? status : undefined,/);
  assert.match(library, /grants: confidentiality === 'confidential' && canManageAccess \? grants : undefined,/);
  for (const label of ['استفاده از فایل موجود', 'بدون تکثیر فیزیکی', 'ثبت به عنوان نسخه جدید', 'ایجاد دارایی جدا']) assert.ok(library.includes(label), label);
  assert.match(library, /تصمیم نهایی با سرور است؛ سرور فایل را با اثر انگشت SHA-256 تطبیق می‌دهد/);

  // سازندهٔ ضمیمه: سیاست تکراری، فراداده، پوشهٔ هر فایل و بارگذاری پوشه‌ای
  assert.match(composer, /duplicateAction\?: 'reuse' \| 'new_version' \| 'create';/);
  assert.match(composer, /body\.append\('duplicate_action', value\.duplicateAction \|\| 'reuse'\);/);
  assert.match(composer, /const appendAssetDefaults = \(body: FormData \| Record<string, unknown>, defaults\?: AttachmentDraft\['defaults'\]\) => \{/);
  assert.match(composer, /\['category_id', defaults\.categoryId\],/);
  assert.match(composer, /body\.append\(`\$\{key\}\[\$\{nested\}\]\[\$\{index\}\]`, String\(item\)\)\)/);
  assert.match(composer, /const targetFolder = value\.fileFolderIds\?\.\[key\] \|\| value\.folderId;/);
  assert.match(composer, /allowDirectoryUpload = false/);
  assert.match(composer, /const addDirectory = async \(files: FileList \| null\) => \{/);
  assert.match(composer, /webkitdirectory: '', directory: ''/);

  // سرور همان فیلدها را می‌پذیرد؛ هیچ تغییر جدول یا ستونی لازم نیست
  assert.match(controller, /'category_id' => 'nullable\|integer\|exists:dam_categories,id',/);
  assert.match(controller, /'confidentiality' => \['nullable', Rule::in\(\['public', 'internal', 'confidential'\]\)\],/);
  assert.match(controller, /'duplicate_action' => \['nullable', Rule::in\(\['warn', 'reuse', 'new_version', 'create'\]\)\],/);
  assert.match(controller, /'access_grants\.projects\.\*' => 'integer\|exists:projects,id',/);
  assert.match(controller, /'folder_id' => 'nullable\|integer\|exists:dam_folders,id',/);
});

test('comment composers make the existing @name mention feature discoverable in Persian', async () => {
  const [task, content] = await Promise.all([
    source('../src/components/tasks/TaskDetailDrawer.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
  ]);

  for (const view of [task, content]) {
    assert.match(view, /نام کامل او را بعد از @ بنویسید \(مثال: @علی رضایی\)/);
    assert.match(view, /اعلان اشاره فقط برای همان کاربر ثبت شود/);
  }
  // پیاده‌سازی سرور همین قرارداد را دارد: نام واقعی کاربر بعد از @
  const notifications = await source('../../backend/app/Services/CommentNotifications.php');
  assert.match(notifications, /if \(mb_stripos\(\$body, '@'\.\$name\) !== false\) \{/);
  assert.match(notifications, /if \(! NotificationPolicy::enabled\('mentionAlerts'\)\) \{/);
});
