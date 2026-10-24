import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('ویرایش محتوا: «مرحله بعد» فرم را ارسال نمی‌کند و مدال را نمی‌بندد', async () => {
  const modal = await source('../src/components/content/EditContentModal.tsx');

  // دو دکمهٔ مستقل: تا مرحلهٔ آخر هیچ دکمهٔ submit وجود ندارد. پیش‌تر ری‌اکت
  // همان گره را از type="button" به type="submit" تبدیل می‌کرد و کلیکِ «مرحله
  // بعد» فرم را ارسال و مدال را می‌بست.
  assert.match(modal, /\{step < 3 && <button type="button"[^>]*onClick=\{\(\) => setStep\(current => current \+ 1\)\}/);
  assert.match(modal, /\{step === 3 && <button data-button-action="save" type="submit"/);
  assert.doesNotMatch(modal, /step < 3 \? <button/);

  // ارسالِ زودهنگام (Enter در مرحله‌های قبل) فقط مرحله را جلو می‌برد.
  assert.match(modal, /if \(step < 3\) \{ setStep\(current => current \+ 1\); return; \}/);
  // ذخیره فقط از مرحلهٔ سوم و پس از پایان کار انجام می‌شود.
  assert.match(modal, /handleSubmit[\s\S]{0,400}if \(busy\) return;/);
});

test('خطای ۴۲۲ وظیفه دلیل واقعی را نشان می‌دهد، نه پیام کلی', async () => {
  const [errors, create, edit, app] = await Promise.all([
    source('../src/api/errors.ts'),
    source('../src/components/tasks/CreateTaskModal.tsx'),
    source('../src/components/tasks/EditTaskModal.tsx'),
    source('../src/context/AppContext.tsx'),
  ]);

  // خطای هر فیلد بر پیام عمومیِ وضعیت مقدم است.
  assert.match(errors, /const validationDetail = error instanceof ApiError && status === 422/);
  assert.match(errors, /firstFieldMessage\(error\.errors\)/);
  assert.match(errors, /export function apiErrorDetails/);

  // هر دو فرم وظیفه فهرست دلیل‌ها را زیر پیام نشان می‌دهند.
  for (const modal of [create, edit]) {
    assert.match(modal, /apiErrorDetails/);
    assert.match(modal, /role="alert"/);
  }
  assert.match(create, /setSubmitReasons\(apiErrorDetails\(error\)/);
  assert.match(edit, /setErrorDetails\(apiErrorDetails\(caught\)/);

  // مهلتِ قبل از تاریخ شروع پیش از درخواست با پیام روشن گفته می‌شود.
  assert.match(edit, /نمی‌تواند قبل از تاریخ شروع وظیفه/);

  // در اعلان خطا، نامِ فنیِ فیلدهای ردشده هم برای پیگیری می‌آید.
  assert.match(app, /فیلد: \$\{fields\.slice\(0, 4\)\.join\('، '\)\}/);
});

test('ویرایش وظیفهٔ محتوایی فیلدهای منبع‌محور را نمی‌فرستد و علت را توضیح می‌دهد', async () => {
  const [edit, operations] = await Promise.all([
    source('../src/components/tasks/EditTaskModal.tsx'),
    source('../../backend/app/Services/TaskOperations.php'),
  ]);

  // عنوان/توضیحات/مهلت/اولویت از مرحلهٔ محتوا می‌آیند؛ هم غیرفعال می‌شوند و
  // هم در بدنهٔ درخواست نمی‌آیند تا ۴۲۲ِ بی‌دلیل رخ ندهد.
  assert.match(edit, /const sourceLocked = \['content_work', 'content_review'\]\.includes\(task\.kind \|\| ''\);/);
  assert.match(edit, /\.\.\.\(sourceLocked \? \{\} : \{ title: title\.trim\(\), description: description\.trim\(\), deadline, priority \}\)/);
  assert.match(edit, /disabled=\{sourceLocked\}/);
  assert.match(edit, /برای اصلاح آن‌ها همان پروندهٔ محتوا را ویرایش کنید/);

  // ۴۲۲ِ بدون پیام در ویرایش مشخصات وظیفه حذف شد؛ نام فیلدهای غیرمجاز می‌آید.
  assert.match(operations, /\$rejected = array_values\(array_diff\(array_keys\(\$data\), array_keys\(\$this->detailRules\(\$task\)\)\)\);/);
  assert.match(operations, /این بخش‌ها از مسیر ویرایش مشخصات قابل تغییر نیستند/);
});

test('بات: وظیفهٔ محتوایی «باز کردن محتوا» و «ثبت ردیف جدول» دارد', async () => {
  const [links, router, outputs] = await Promise.all([
    source('../../backend/app/Bot/Bale/Support/PanelLinks.php'),
    source('../../backend/app/Bot/Bale/Routing/MenuRouter.php'),
    source('../../backend/app/Bot/Bale/Handlers/ContentStageOutputs.php'),
  ]);

  assert.match(links, /باز کردن همین محتوا در سامانه/);
  assert.match(links, /\^content:\(\[1-9\]\[0-9\]\{0,17\}\)\$/);
  assert.match(links, /return '\?content='\.\$match\[1\];/);

  // دکمهٔ سامانه برای وظیفهٔ محتوایی به خودِ محتوا اشاره می‌کند.
  assert.match(router, /\$panel = is_numeric\(\$task->content_id\) \? \['content', \(int\) \$task->content_id\] : null;/);
  assert.match(router, /\$this->reply\(\$key, \$chat, \$link, \$body, \$buttons, 'task', \$task->id, \[\], false, \$panel\);/);
  // ثبت ردیف جدول اطلاعات از جزئیات وظیفهٔ محتوایی در دسترس است.
  assert.match(router, /'📊 ثبت ردیف جدول اطلاعات', 'callback_data' => 'assetrows:'\.\$task->id/);

  assert.match(outputs, /buttons\(\$link, \$contentId \? 'content' : 'task', \$contentId \?\? \$task->id\)/);
});
