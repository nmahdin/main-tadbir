import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۸۳ — تیک گرد وظایف، جست‌وجوی موبایل، مدال‌های سراسری ایده/جلسه،
 * جانمای لودینگ ویدیو، لودینگ پنل بله، جدول تمام‌صفحه و بهینه‌سازی مصرف اینترنت.
 */
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const related = read('../src/components/workspace/RelatedRecords.tsx');
const myTasks = read('../src/components/tasks/MyTasksView.tsx');
const css = read('../src/index.css');
const navbar = read('../src/components/layout/TopNavbar.tsx');
const search = read('../src/components/layout/GlobalSearchModal.tsx');
const app = read('../src/App.tsx');
const sidebar = read('../src/components/layout/Sidebar.tsx');
const ui = read('../src/context/UIContext.tsx');
const player = read('../src/components/common/MediaPlayer.tsx');
const bale = read('../src/components/bale/BaleAccountPanel.tsx');
const tables = read('../src/components/dam/DamDataTables.tsx');
const realtime = read('../src/api/chatRealtime.ts');
const viteConfig = read('../vite.config.ts');
const html = read('../index.html');

test('تیک تکمیل وظیفه در جدول‌های وظایف همیشه دایره است', () => {
  // کلاس صریح + گردی درون‌خطی (هیچ قاعدهٔ سراسری نمی‌تواند آن را مربع کند).
  assert.match(related, /ui-check-circle !rounded-full flex h-5 w-5 shrink-0 items-center justify-center border-2/);
  assert.match(related, /style=\{\{ borderRadius: '50%', minHeight: 0 \}\}/);
  // همان رفتار در فهرست «تسک‌های من» هم یکدست شد.
  assert.match(myTasks, /!rounded-full border-2 transition-colors/);
  assert.match(myTasks, /style=\{\{ borderRadius: '50%', minHeight: 0 \}\}/);
  // قاعدهٔ سراسری با انتخابگر قوی‌تر و !important.
  assert.match(css, /td button\.ui-check-circle,\s*button\.ui-check-circle,\s*\.ui-check-circle \{\s*border-radius: 9999px !important;/);
});

test('جست‌وجوی سراسری روی موبایل دکمهٔ مستقل و مدالِ تمام‌قد دارد', () => {
  // پیش‌تر آیکون جست‌وجو در ستونِ درون‌جریانِ قابل‌کوچک‌شدن بود و می‌توانست از
  // کادر بیرون برود؛ حالا دکمهٔ ۳۶ پیکسلی در گروه اکشن‌هاست.
  assert.match(navbar, /id="top-search-btn"/);
  assert.match(navbar, /aria-label="جست‌وجوی سراسری"/);
  // پنهان‌شدن روی دسکتاپ با همان utilities تیلویند است (`hidden sm:inline-flex`)؛
  // قاعدهٔ نمایش در لایهٔ base تعریف شده تا utilities بر آن غلبه کنند.
  // پنهان‌شدن روی دسکتاپ با `sm:hidden` است و قاعدهٔ نمایش در لایهٔ base
  // تعریف شده تا utility بر آن غلبه کند (دور ۸۷).
  assert.match(navbar, /className="ui-tap inline-flex[^"]*sm:hidden"/);
  assert.doesNotMatch(navbar, /<div className="flex-1 sm:hidden flex justify-end mx-2">/);
  // سطح لمس ۳۶ پیکسلی که در فشار عرض کوچک نمی‌شود.
  assert.match(css, /\.ui-tap \{\s*box-sizing: border-box;\s*min-width: var\(--button-height\);\s*min-height: var\(--button-height\);\s*flex: 0 0 auto;/);
  // مدال: ارتفاع پویا، فوکوس هم‌زمان، ورودی ۱۶px تا iOS زوم/کیبورد را رد نکند.
  assert.match(search, /max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(search, /inputRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(search, /text-base font-medium text-slate-900 outline-none ring-0 placeholder:text-slate-500 sm:text-sm/);
  assert.match(search, /type="search"/);
  // بستهٔ مدال در زمان بیکاری/قصد کاربر پیش‌بارگیری می‌شود.
  assert.match(app, /void preloadGlobalSearch\(\);/);
  assert.match(navbar, /const warmSearch = \(\) => \{ preloadGlobalSearch\(\); \};/);
});

test('«ایده جدید» و «جلسه جدید» بدون ترک صفحه مدال را باز می‌کنند', () => {
  assert.match(sidebar, /setIsCreateIdeaOpen\(true\); setIsQuickAddOpen\(false\);/);
  assert.match(sidebar, /setIsCreateMeetingOpen\(true\); setIsQuickAddOpen\(false\);/);
  // هیچ‌کدام دیگر به اتاق فکر نمی‌روند.
  assert.doesNotMatch(sidebar, /handleNavClick\('thought-room'\); setIsQuickAddOpen/);
  assert.match(ui, /const \[isCreateIdeaOpen, setIsCreateIdeaOpen\] = useState\(false\);/);
  assert.match(ui, /const \[isCreateMeetingOpen, setIsCreateMeetingOpen\] = useState\(false\);/);
  assert.match(app, /\{isCreateIdeaOpen && <CreateIdeaModal isOpen onClose=\{\(\) => setIsCreateIdeaOpen\(false\)\} \/>\}/);
  assert.match(app, /\{isCreateMeetingOpen && <CreateMeetingModal isOpen onClose=\{\(\) => setIsCreateMeetingOpen\(false\)\} \/>\}/);
});

test('ویدیو تا آماده‌شدن، جانمای لودینگ هم‌اندازه نشان می‌دهد و بعد نرم ظاهر می‌شود', () => {
  assert.match(player, /const verticalReady = isVideo && ready && !failed;/);
  // کادر: پیش از آماده‌شدن روشن، بعد سیاه — با گذار.
  assert.match(player, /verticalReady \? 'border-slate-200 bg-black' : 'border-slate-200 bg-slate-100'/);
  assert.match(player, /transition-colors duration-500/);
  // خود ویدیو تا آماده‌شدن دیده نمی‌شود و سپس «مات → شفاف» می‌شود.
  assert.match(player, /transition-opacity duration-500 ease-out \$\{verticalReady \? 'opacity-100' : 'pointer-events-none opacity-0'\}/);
  // جانما: یک قاب، با نشانگر و پیام در مرکز (دور ۸۵: لایهٔ دوم حذف شد).
  assert.match(player, /aria-label="در حال آماده‌سازی پخش‌کنندهٔ ویدیو"/);
  assert.match(player, /data-video-placeholder="single"/);
  assert.match(player, /flex flex-col items-center justify-center gap-3 p-4 text-center/);
  assert.doesNotMatch(player, /ui-skeleton h-full w-full absolute inset-0/);
  // کنترل‌ها هم تا اولین فریم پنهان می‌مانند.
  assert.match(player, /data-visible=\{isVideo \? \(verticalReady && controlsVisible \? 'true' : 'false'\) : 'true'\}/);
});

test('تب «حساب بله» تا رسیدن داده‌ها حالت لودینگ دارد', () => {
  assert.match(bale, /const \[loadingAccount, setLoadingAccount\] = useState\(true\);/);
  assert.match(bale, /if \(loadingAccount\) \{/);
  assert.match(bale, /در حال دریافت وضعیت…/);
  assert.match(bale, /در حال خواندن وضعیت اتصال حساب بله از سرور…/);
  assert.match(bale, /setAccount\(response\.data\); setLoadingAccount\(false\);/);
});

test('جدول اطلاعات در تمام‌صفحه عرض قاب را می‌گیرد', () => {
  assert.match(tables, /style=\{fullscreen\s*\? \{ width: '100%', minWidth: Math\.min\(sheetWidth, 560\) \}/);
  assert.match(tables, /: \{ width: sheetWidth, minWidth: Math\.min\(sheetWidth, 560\) \}\}/);
  assert.match(tables, /className="table-fixed border-collapse text-xs"/);
});

test('درخواست‌های پس‌زمینه در تب پنهان متوقف می‌شوند', () => {
  // چت: حضور/تایپ در تب پنهان فرستاده نمی‌شود و با بازگشت تازه می‌شود.
  assert.match(realtime, /const hidden = \(\) => typeof document !== 'undefined' && document\.visibilityState === 'hidden';/);
  assert.match(realtime, /if \(closed \|\| websocketReady \|\| hidden\(\)\) return;/);
  assert.match(realtime, /document\.addEventListener\('visibilitychange', onVisible\)/);
  // بله: پنجرهٔ کد با فاصلهٔ بیشتر و فقط در تب دیده‌شده.
  assert.match(bale, /document\.visibilityState === 'hidden'/);
  assert.match(bale, /setInterval\(\(\) => void checkConnection\(\), 5_000\)/);
});

test('پیش‌اتصال به میزبان API در HTML تولیدی تزریق می‌شود', () => {
  assert.match(html, /__TADBIR_API_HINTS__/);
  assert.match(viteConfig, /<link rel="preconnect" href="\$\{apiOrigin\}" crossorigin \/>/);
  assert.match(viteConfig, /<link rel="dns-prefetch" href="\$\{apiOrigin\}" \/>/);
  assert.match(viteConfig, /output\.replace\('__TADBIR_API_HINTS__', hints\)/);
});

test('گزارش کارایی بهینه‌سازی در مخزن ثبت شده است', () => {
  const report = read('../../docs/perf/round83-performance-audit.md');
  assert.match(report, /گزارش بهینه‌سازی سرعت و مصرف اینترنت/);
  assert.match(report, /بندانگشتی/);
  assert.match(report, /preconnect/);
});
