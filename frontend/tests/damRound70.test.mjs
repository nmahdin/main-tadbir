import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('DAM asset view renames display name and original filename and previews old versions', async () => {
  const [dam, controller, drawerLabels] = await Promise.all([
    source('../src/components/dam/DamLibrary.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
    source('../src/utils/activityLabels.ts'),
  ]);

  // نام نمایشی و نام فایل اصلی، هر دو، از مودال مشاهدهٔ دارایی قابل ویرایش‌اند.
  assert.match(dam, /نام نمایشی/);
  assert.match(dam, /نام فایل اصلی/);
  assert.match(dam, /changes\.original_filename = fileNameDraft\.trim\(\)/);
  assert.match(controller, /'original_filename' => 'sometimes\|required\|string\|max:255'/);
  assert.match(controller, /private function safeFilename\(string \$name, \?string \$extension\): string/);
  // پسوند اصلی حفظ می‌شود تا فایل دانلودی همچنان باز شود.
  assert.match(controller, /\$clean \.= '\.'\.\$extension/);
  assert.match(drawerLabels, /renamed: 'تغییر نام نمایشی یا نام فایل'/);

  // پیش‌نمایش نسخه‌های قبلی: همان مسیر پیش‌نمایش با پارامتر نسخه.
  assert.match(dam, /const \[previewVersion, setPreviewVersion\] = useState<DamVersion \| null>\(null\)/);
  assert.match(dam, /پیش‌نمایش نسخه \$\{previewVersion\.version_number\}/);
  assert.match(dam, /assetId=\{asset\.id\} version=\{previewVersion\.version_number\}/);
  assert.match(controller, /private function versionFile\(DamAsset \$asset, Request \$request\)/);
  assert.match(controller, /\$request->query\('version'\)/);
  assert.match(controller, /\$this->permitted\(\$request, 'assets\.preview', \$asset\);\n        \$file = \$this->versionFile\(\$asset, \$request\);/);
});

test('DAM library drops the internal notice, shows content names, and keeps folders collapsed', async () => {
  const [dam, presenter] = await Promise.all([
    source('../src/components/dam/DamLibrary.tsx'),
    source('../../backend/app/Services/DamRelationPresenter.php'),
  ]);

  // توضیح «داخلی یعنی …» حذف شده است.
  assert.doesNotMatch(dam, /«داخلی» یعنی/);
  // برچسب سطح دسترسی برای انتخاب، کوتاه و بدون توضیح بلند است.
  assert.match(dam, /internal: 'داخلی'/);

  // ستون «ارتباط» فقط نام محتوا را نشان می‌دهد، نه کد محتوا.
  assert.doesNotMatch(presenter, /trim\(\(\(string\) \$content->code\)\.' — '\.\$content->title/);
  assert.match(presenter, /'content' => \(\$content = \$contents->get\(\$relation->related_id\)\)\n\s*\? trim\(\(string\) \$content->title\)/);

  // پوشه‌ها به‌صورت پیش‌فرض بسته‌اند؛ فقط مسیر پوشهٔ جاری باز می‌شود.
  assert.match(dam, /const \[expanded, setExpanded\] = useState\(currentInBranch\);/);
  assert.doesNotMatch(dam, /useState\(depth === 0 \|\| currentInBranch\)/);
});

test('DAM filters use searchable selects and compact Jalali date pickers', async () => {
  const [dam, combo] = await Promise.all([
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/common/SearchableSelect.tsx'),
  ]);

  // پنج فیلتر انتخابی، ورودی جست‌وجو دارند.
  for (const label of ['فیلتر دسته‌بندی', 'فیلتر پروژه', 'فیلتر وظیفه', 'فیلتر دپارتمان', 'فیلتر محتوا']) {
    assert.match(dam, new RegExp(`ariaLabel="${label}"`));
  }
  assert.match(dam, /import \{ SearchableSelect \} from '\.\.\/common\/SearchableSelect';/);
  // فهرست در body رندر می‌شود و با صفحه‌کلید کار می‌کند.
  assert.match(combo, /createPortal\(panel, document\.body\)/);
  assert.match(combo, /searchPlaceholder = 'جست‌وجو…'/);
  assert.match(combo, /event\.key === 'ArrowDown'/);
  assert.match(combo, /event\.key === 'Escape'/);

  // ورودی تاریخ، فشرده و شمسی است (نه input type=date میلادی بزرگ).
  assert.doesNotMatch(dam, /<input type="date"/);
  assert.match(dam, /<PersianDatePicker value=\{createdFrom\}/);
  assert.match(dam, /<PersianDatePicker value=\{createdTo\}/);
});

test('text asset exports keep the chosen font in both Word and PDF', async () => {
  const downloads = await source('../src/utils/textAssetDownload.ts');
  // PDF هر قطعه را با سبک خودش (قلم/اندازه/ضخامت/رنگ) رندر می‌کند.
  assert.match(downloads, /const resolveFamily = \(raw: string \| null \| undefined\): string/);
  assert.match(downloads, /const renderStyledPdfPages = async \(title: string, html: string\)/);
  assert.match(downloads, /context\.font = fontOf\(segment\.style\)/);
  assert.match(downloads, /const wordFamilyName = \(stack: string\)/);
  // سند Word قلم غالب متن را به‌عنوان قلم پایهٔ سند می‌گذارد.
  assert.match(downloads, /font-family:'\$\{family\.name\}','\$\{family\.fallback\}',Tahoma,sans-serif/);
});
