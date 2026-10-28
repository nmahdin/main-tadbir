import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * اصلاح‌های این دور در بات بله:
 * ۱) دریافت پروندهٔ فرستاده‌شده در گفتگو + انتخاب پوشهٔ مقصد برای فایل و متن.
 * ۲) کارکردنِ «اطلاعات جدول» بدون دپارتمان.
 * ۳) باز شدن فرم امنِ مینی‌اپ (پارامترهای نشانی باید تا باز شدن صفحه حفظ شوند).
 * ۴) حذف دکمهٔ اضافیِ «ثبت ردیف جدول» از جزئیات تسک.
 */
test('مینی‌اپ بله: تغییر مسیر ریشه و تغییر صفحه، پارامتر فرم را حفظ می‌کند', async () => {
  const [app, ui] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/context/UIContext.tsx'),
  ]);

  // `/` دیگر پارامترهای نشانی (مثل dam_entry) را دور نمی‌ریزد.
  assert.match(app, /function RootRedirect\(\) \{/);
  assert.match(app, /<Navigate replace to=\{\{ pathname: '\/dashboard', search: location\.search, hash: location\.hash \}\} \/>/);
  assert.match(app, /<Route path="\/" element=\{<ProtectedRoute><RootRedirect \/><\/ProtectedRoute>\} \/>/);
  assert.doesNotMatch(app, /<Navigate replace to="\/dashboard" \/>/);

  // رفتن به صفحهٔ مخزن هم درخواست فرم را زنده نگه می‌دارد.
  assert.match(ui, /const DEEP_LINK_PARAMS = \['dam_entry', 'asset', 'dam_folder'\];/);
  assert.match(ui, /const search = deepLinkSearch\(\);/);
  // مبنای پارامترها نشانیِ واقعیِ مرورگر است تا پس از مصرفِ پارامتر تکرار نشود.
  assert.match(ui, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(ui, /navigate\(`\$\{viewPaths\[view\] \|\| '\/dashboard'\}\$\{search\}`\)/);
});

test('بات بله: پوشهٔ مقصد برای فایل و متنِ ثبت‌شده در بات انتخاب می‌شود', async () => {
  const [assets, folders, outbox] = await Promise.all([
    source('../../backend/app/Bot/Bale/Handlers/TaskAssets.php'),
    source('../../backend/app/Bot/Bale/Support/AssetFolders.php'),
    source('../../backend/app/Bot/Bale/Outbox.php'),
  ]);

  // دکمهٔ پوشه در پیش‌نمایشِ تأیید، و پیمایشِ درخت پوشه‌ها
  assert.match(assets, /private function assetConfirmRows\(BaleConversation \$session, array \$data\): array/);
  assert.match(assets, /'📁 پوشهٔ مقصد: '\.\$short, 'callback_data' => AssetFolders::browse/);
  assert.match(assets, /preg_match\('\/\^asset\(dir\|use\):\(\[a-f0-9\]\{24\}\):\(\\d\{1,18\}\)\(\?::\(\\d\{1,3\}\)\)\?\$\/'/);
  assert.match(assets, /'folder_id' => isset\(\$data\['folder_id'\]\) && \(int\) \$data\['folder_id'\] > 0 \? \(int\) \$data\['folder_id'\] : null/);
  assert.match(folders, /public static function browse\(string \$nonce, int \$folderId, int \$page = 0\): string/);
  assert.match(folders, /public static function use\(string \$nonce, int \$folderId\): string/);
  assert.match(folders, /public function label\(\?int \$folderId\): string/);
  // پیام‌های همین بخش (فایل/متن) با مجوز دارایی کاربر فرستاده می‌شوند.
  assert.match(assets, /_asset_text' => \$sensitive/);
  assert.match(outbox, /_asset_text/);
});

test('بات بله: دریافت پرونده دلیل واقعی شکست را نشان می‌دهد', async () => {
  const [incoming, client, assets] = await Promise.all([
    source('../../backend/app/Bot/Bale/Support/IncomingFile.php'),
    source('../../backend/app/Bot/Bale/Client/BaleClient.php'),
    source('../../backend/app/Bot/Bale/Handlers/TaskAssets.php'),
  ]);

  assert.match(incoming, /public function failure\(\): \?string/);
  assert.match(incoming, /public function failureText\(\?string \$reason = null\): string/);
  assert.match(incoming, /\$this->failure = 'not_found';/);
  assert.match(incoming, /\$this->failure = 'store_failed';/);
  assert.match(incoming, /\$this->failure = match \(\$error->reason\)/);
  // تغییرمسیر بله به میزبان فایل، دیگر دریافت را قطع نمی‌کند؛ مقصدِ غیر bale ممنوع است.
  assert.match(client, /'allow_redirects' => \['max' => 3, 'strict' => true, 'referer' => false, 'protocols' => \['https'\]\]/);
  assert.match(client, /str_ends_with\(\$host, '\.bale\.ai'\)/);
  assert.match(assets, /\$send\('❌ دریافت این پرونده از بله ناموفق بود: '\.\$files->failureText\(\)/);
});

test('بات بله: اطلاعات جدول بدون دپارتمان کار می‌کند', async () => {
  const outbox = await source('../../backend/app/Bot/Bale/Outbox.php');

  // پیامِ فهرست جدول‌ها نباید به‌خاطر نبودِ دپارتمان لغو شود.
  assert.match(outbox, /\$department > 0 && ! Department::whereKey\(\$department\)/);
  assert.match(outbox, /: app\(DamTableAccess::class\)->canEdit\(\$user, \$table\)/);
  assert.match(outbox, /if \(\$message->subject_type === 'asset_tables'\) \{/);
  assert.match(outbox, /if \(\$message->subject_type === 'asset_table'\) \{/);
});

test('بات بله: دکمهٔ «ثبت ردیف جدول» از جزئیات تسک حذف شد', async () => {
  const router = await source('../../backend/app/Bot/Bale/Routing/MenuRouter.php');

  assert.doesNotMatch(router, /ثبت ردیف جدول اطلاعات/);
  assert.doesNotMatch(router, /'assetrows:'\.\$task->id/);
  // مسیر ثبت دارایی برای وظیفه‌های عمومی سر جای خود است.
  assert.match(router, /'taskasset:'\.\$task->id/);
});
