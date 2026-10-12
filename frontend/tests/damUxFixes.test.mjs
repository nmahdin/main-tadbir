import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('text-asset preview/download buttons share one definition with uploaded files', async () => {
  const [actions, library, css] = await Promise.all([
    source('../src/components/common/TextAssetActions.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/index.css'),
  ]);

  // یک منبع حقیقت مشترک برای هندسه و رنگ دکمه‌ها
  assert.match(css, /\.ui-asset-action \{/);
  assert.match(css, /\.ui-asset-action-preview \{ color: var\(--color-primary\); \}/);
  assert.match(css, /\.ui-asset-action-download \{ color: #059669; \}/);
  assert.match(actions, /export const ASSET_ACTION_PREVIEW_CLASS = 'ui-asset-action ui-asset-action-preview'/);
  assert.match(actions, /export const ASSET_ACTION_DOWNLOAD_CLASS = 'ui-asset-action ui-asset-action-download'/);

  // دارایی متنی و فایل آپلودی هر دو همین کلاس‌ها را می‌گیرند
  assert.match(actions, /className=\{ASSET_ACTION_PREVIEW_CLASS\}/);
  assert.match(actions, /className=\{ASSET_ACTION_DOWNLOAD_CLASS\}/);
  assert.match(library, /className=\{ASSET_ACTION_PREVIEW_CLASS\}/);
  assert.match(library, /className=\{ASSET_ACTION_DOWNLOAD_CLASS\}/);
  assert.doesNotMatch(actions, /ui-icon-button/);
  assert.doesNotMatch(actions, /variant="secondary"/);

  // قالب‌های دانلود متن (TXT/Word/PDF) حذف نشده‌اند
  assert.match(actions, /export const TEXT_ASSET_FORMATS/);
  for (const format of ["id: 'txt'", "id: 'doc'", "id: 'pdf'"]) assert.match(actions, new RegExp(format));
  for (const label of ['متن ساده \\(TXT\\)', 'سند Word', 'سند PDF']) assert.match(actions, new RegExp(label));
  assert.match(actions, /aria-label="مشاهده متن"/);

  // فهرست قالب‌ها نباید داخل قاب بریده‌شدهٔ کارت‌ها بیفتد: روی کل صفحه رندر می‌شود
  assert.match(actions, /import \{ createPortal \} from 'react-dom'/);
  assert.match(actions, /createPortal\(/);
  assert.match(actions, /document\.body,/);
  assert.match(actions, /position: 'fixed'/);
  assert.doesNotMatch(actions, /bottom-full/);
  assert.doesNotMatch(actions, /absolute bottom-full/);
});

test('view-mode switcher sits beside the asset counters and leaves the filter toolbar', async () => {
  const library = await source('../src/components/dam/DamLibrary.tsx');

  assert.match(library, /const ViewModeSwitcher: React\.FC<\{ mode: LibraryView; onChange: \(mode: LibraryView\) => void \}>/);
  assert.match(library, /aria-label="حالت نمایش دارایی‌ها"/);
  for (const title of ['نمای شبکه‌ای', 'نمای جدولی', 'نمای فهرستی سریع', 'مرورگر فایل شبیه ویندوز و پنل میزبانی']) {
    assert.match(library, new RegExp(title));
  }
  // ترتیب صفحه: باکس‌های شمارش و بعد کلید حالت نمایش، هر دو در یک ردیف
  assert.match(library, /label="کل دارایی‌ها"[\s\S]{0,1400}ViewModeSwitcher mode=\{viewMode\} onChange=\{setViewMode\}/);
  assert.match(library, /xl:flex-row xl:items-stretch/);
  assert.match(library, /<div className="xl:w-72">/);
  // در حالت بستر (پروژه/وظیفه) هم کلید نمایش باید در دسترس بماند
  assert.match(library, /w-72 max-w-full/);
  // گروه چهار‌دکمه‌ای قبلی در نوار فیلتر حذف شده است
  assert.doesNotMatch(library, /setViewMode\('grid'\)/);
  assert.doesNotMatch(library, /setViewMode\('explorer'\)/);
  assert.match(library, /setViewMode\('table'\); setFolderId\(null\); setPage\(1\); \}/);
});

test('file-manager view drops the extra chrome and keeps its search readable', async () => {
  const library = await source('../src/components/dam/DamLibrary.tsx');

  assert.match(library, /data-dam-mode="file-manager" className="min-h-\[72dvh\] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"/);
  assert.doesNotMatch(library, /bg-slate-100\/80/);
  assert.doesNotMatch(library, /min-h-\[52dvh\] bg-white/);
  assert.match(library, /<div className="min-h-\[52dvh\] p-2 sm:p-3">/);
  // آیکون جست‌وجو نباید روی متن بیفتد: shorthand دات‌یو‌آی‌اینپوت با pr- بدون ! غلبه می‌کند
  assert.match(library, /placeholder="جست‌وجو در همین پوشه" className="ui-input !pr-10 text-xs"/);
  assert.doesNotMatch(library, /className="ui-input pr-9/);
});

test('preview modal shows text and file assets in the same strip', async () => {
  const library = await source('../src/components/dam/DamLibrary.tsx');
  const strip = 'flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3';
  const matches = library.split(strip).length - 1;
  assert.equal(matches, 2, 'دارایی متنی و فایل باید یک قالب نوار مشترک داشته باشند');
  assert.match(library, /دارایی متنی · پیش‌نمایش یا دریافت متن/);
});
