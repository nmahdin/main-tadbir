import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/**
 * دور ۷۵: دوازده اصلاح در یک بسته.
 *
 * این فایل قراردادهای آن دور را قفل می‌کند تا در تغییرات بعدی برنگردند:
 *  - ارسال کد یک‌بارمصرف فقط برای حسابِ متصل به بله.
 *  - آیکون نمایش/پنهان رمز در جای درست و تراز.
 *  - حذف توضیح زیر عنوان سامانه در سایدبار.
 *  - تقویم بازطراحی‌شده: تب آیکونی، کارت‌های بی‌حاشیه با رنگ وضعیت واقعی،
 *    کار بسته‌شده کم‌رنگ و طوسی.
 *  - انیمیشن خروج همهٔ مدال‌ها و منوهای شناور.
 *  - نوار سربرگ جزئیات محتوا هم‌رنگ رنگ اصلی سامانه.
 *  - پیش‌نمایش محتوا با پردهٔ لودینگ.
 *  - دکمه‌های بایگانی خاکستری در کل سامانه.
 *  - نمایش زیبای خطای اتصال به اینترنت.
 *  - فاوآیکون بارگذاری‌شده که جای آیکون قبلی را می‌گیرد.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(path, import.meta.url));

const css = read('../src/index.css');
const app = read('../src/App.tsx');
const indexHtml = read('../index.html');
const favicon = read('../src/utils/favicon.ts');
const mediaUrl = read('../src/utils/mediaUrl.ts');
const primitives = read('../src/components/common/Primitives.tsx');
const modalExitHook = read('../src/components/common/useModalExit.ts');
const modalExitLayer = read('../src/utils/modalExitLayer.ts');
const exitPresence = read('../src/components/common/useExitPresence.ts');
const topNavbar = read('../src/components/layout/TopNavbar.tsx');
const sidebar = read('../src/components/layout/Sidebar.tsx');
const authModal = read('../src/components/auth/AuthModal.tsx');
const calendarViews = read('../src/components/calendar/CalendarViews.tsx');
const projectCalendar = read('../src/components/projects/ProjectCalendarView.tsx');
const calendarCard = read('../src/components/calendar/CalendarEventCard.tsx');
const calendarTone = read('../src/utils/calendarTone.ts');
const publishingCalendar = read('../src/components/content/PublishingCalendar.tsx');
const contentDetail = read('../src/components/content/ContentDetailView.tsx');
const stageSections = read('../src/components/content/StageAssetSections.tsx');
const imagePreview = read('../src/components/common/ImagePreview.tsx');
const connectionBanner = read('../src/components/common/ConnectionBanner.tsx');
const connectionState = read('../src/utils/connectionState.ts');
const apiClient = read('../src/api/client.ts');
const feedback = read('../src/components/common/Feedback.tsx');
const damLibrary = read('../src/components/dam/DamLibrary.tsx');
const seriesView = read('../src/components/content/ContentSeriesView.tsx');
const projectDetail = read('../src/components/projects/ProjectDetailView.tsx');

const challenge = read('../../backend/app/Services/BaleAuthChallenge.php');
const challengeTest = read('../../backend/tests/Feature/Bale/BaleUnlinkedCodeTest.php');

test('کد یک‌بارمصرف فقط برای حساب متصل به بله فرستاده می‌شود', () => {
  // ارسال به «شمارهٔ ثبت‌شده» ممکن نیست و کامل برداشته شد.
  assert.doesNotMatch(challenge, /deliverToPhone/);
  assert.doesNotMatch(challenge, /sendTextMessage/);
  assert.match(challenge, /امکان ارسال کد یک‌بارمصرف وجود ندارد؛/);
  assert.match(challenge, /به ربات بله متصل نشده است/);
  assert.ok(exists('../../backend/tests/Feature/Bale/BaleUnlinkedCodeTest.php'));
  assert.match(challengeTest, /class BaleUnlinkedCodeTest extends TestCase/);
});

test('آیکون نمایش رمز وسط و تراز است و برای صفحه‌خوان برچسب دارد', () => {
  assert.match(authModal, /aria-label=\{showPassword \? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'\}/);
  assert.match(authModal, /aria-pressed=\{showPassword\}/);
  // کادر ۳۲ پیکسلی با تراز عمودی دقیق: آیکون دیگر به لبه نمی‌چسبد.
  assert.match(authModal, /absolute left-1\.5 top-1\/2 flex h-8 w-8 -translate-y-1\/2 items-center justify-center rounded-lg/);
});

test('توضیح زیر عنوان سامانه در سایدبار حذف شده است', () => {
  assert.doesNotMatch(sidebar, /مدیریت یکپارچه کار و دانش سازمان/);
  assert.match(sidebar, /<BrandLogo/);
});

test('تقویم: تب آیکونی، خانه‌های بی‌حاشیه و کارت با رنگ وضعیت واقعی', () => {
  // تب‌ها آیکون دارند و انتخاب‌شده رنگی و انتخاب‌نشده سفید است.
  // دور ۷۷: آیکون و زمینهٔ سفید/رنگی به تب‌های «همه/تسک‌ها/پروژه‌ها/محتواها»
  // تعلق داشت؛ تب‌های بازه (ماهانه/هفتگی/سه‌هفتگی) به ظاهر سادهٔ قبلی برگشتند.
  assert.match(projectCalendar, /icon: LucideIcon/);
  assert.match(projectCalendar, /icon: LayoutGrid/);
  assert.match(projectCalendar, /border-indigo-600 bg-indigo-600 text-white/);
  assert.doesNotMatch(calendarViews, /icon: CalendarRange/);
  assert.match(calendarViews, /label: 'ماهانه', hint: 'همهٔ روزهای ماه' \}/);
  // خانه‌های ماه و فهرست روزها فقط خط مویِ درونی دارند، نه حاشیهٔ سنگین.
  assert.match(calendarViews, /bg-white ring-1 ring-inset ring-slate-100/);

  // کارت: زمینهٔ ملایم رنگ وضعیت، بدون حاشیه.
  assert.match(calendarCard, /backgroundColor: `\$\{accent\}1f`/);
  assert.match(calendarCard, /rounded-2xl border-0/);
  assert.match(calendarCard, /'bg-slate-200\/60 opacity-70'/);
  assert.match(calendarTone, /past: 'bg-violet-100\/70'/);

  // تقویم انتشار وضعیت واقعی محتوا را نشان می‌دهد و منتشرشده را کم‌رنگ می‌کند.
  assert.match(publishingCalendar, /const statusOf = \(content: PublicationCalendarEntry\): CalendarEventStatus => \{/);
  assert.match(publishingCalendar, /settled=\{published\}/);
});

test('همهٔ مدال‌ها و منوهای شناور انیمیشن ورود و خروج دارند', () => {
  assert.match(primitives, /useModalExit\(open, onClose\)/);
  assert.match(modalExitHook, /export const MODAL_EXIT_MS = 170;/);
  assert.match(modalExitHook, /skipExit\.current/);
  assert.match(modalExitLayer, /export function installModalExitLayer\(\): \(\) => void \{/);
  assert.match(app, /installModalExitLayer\(\)/);
  assert.match(css, /\.ui-layer-out/);
  assert.match(css, /\.ui-panel-out/);

  assert.match(exitPresence, /export const FLOAT_EXIT_MS = 140;/);
  for (const [name, source] of [['TopNavbar', topNavbar], ['Sidebar', sidebar]]) {
    assert.match(source, /useExitPresence/, `${name} باید انیمیشن خروج منو را داشته باشد`);
  }
});

test('نوار سربرگ جزئیات محتوا هم‌رنگ رنگ اصلی سامانه است', () => {
  assert.match(contentDetail, /bg-\[var\(--color-primary\)\]/);
  assert.doesNotMatch(contentDetail, /from-indigo-600 via-violet-500 to-sky-400/);
});

test('پیش‌نمایش خروجی محتوا پیش از آمدن تصویر/فایل پردهٔ لودینگ دارد', () => {
  assert.match(stageSections, /function PreviewLoading\(/);
  // دور ۷۷: پردهٔ لودینگ تصویر حذف شد؛ خودِ `ImagePreview` لودینگ دارد.
  assert.doesNotMatch(stageSections, /<PreviewLoading label="در حال لود تصویر…"/);
  assert.match(imagePreview, /ui-skeleton absolute inset-0/);
  assert.match(stageSections, /!documentReady && <PreviewLoading label="در حال لود فایل…"/);
  // لودینگ فایل (PDF) همچنان با همان پرده و onLoad خودِ iframe است.
  assert.match(stageSections, /onLoad=\{\(\) => setDocumentReady\(true\)\}/);
});

test('دکمه‌های بایگانی در کل سامانه خاکستری‌اند', () => {
  // مجموعه‌ها: بایگانی با تُن خنثی و حذف با تُن قرمز می‌ماند.
  assert.match(seriesView, /icon=\{Archive\} tone="neutral" label="بایگانی"/);
  assert.match(seriesView, /icon=\{Trash2\} tone="rose" label="حذف"/);
  // مخزن دارایی: بایگانی گروهی خاکستری و فقط «حذف» رنگی می‌ماند.
  assert.match(damLibrary, /hover:bg-slate-100">بایگانی<\/button>/);
  assert.match(damLibrary, /bg-rose-600[^`]*>\s*<Trash2 className="h-3\.5 w-3\.5" \/>حذف<\/button>/);
  // منوی پروژه: بایگانی بدون قرمز.
  assert.doesNotMatch(projectDetail, /text-rose-600[\s\S]{0,120}بایگانی/);
});

test('خطای اتصال به اینترنت با نوار و کارت زیبا نمایش داده می‌شود', () => {
  assert.ok(exists('../src/components/common/ConnectionBanner.tsx'));
  assert.ok(exists('../src/utils/connectionState.ts'));
  assert.match(app, /<ConnectionBanner \/>/);
  assert.match(connectionState, /export function installConnectionWatchers/);
  assert.match(connectionState, /export const subscribeConnection = \(listener: Listener\)/);
  // خطای شبکه در لایهٔ درخواست علامت می‌خورد و با هر پاسخ موفق پاک می‌شود.
  assert.match(apiClient, /markConnectionLost\(/);
  assert.match(apiClient, /markConnectionRestored\(/);
  // پیام‌ها کهربایی و راهنما هستند، نه متن قرمز خام.
  assert.match(connectionBanner, /WifiOff/);
  // دکمهٔ بررسی حالا «بررسی اتصال» است و تلاش خودکار هم خودش انجام می‌شود.
  assert.match(connectionBanner, /بررسی اتصال/);
  assert.match(connectionBanner, /probeConnection/);
  assert.match(feedback, /border-amber-200 bg-amber-50/);
  assert.match(primitives, /WifiOff/);
});

test('فاوآیکون بارگذاری‌شده جای آیکون قبلی را می‌گیرد', () => {
  // فقط یک لینک آیکون در سند می‌ماند و لینک ثابت `index.html` هم نشانه‌گذاری شده
  // تا در جایگزینی نادیده نماند (علتِ ماندن آیکون قبلی همین بود).
  assert.match(indexHtml, /data-tadbir-favicon="pending"/);
  assert.match(favicon, /document\.head\.querySelectorAll<HTMLLinkElement>\('link\[rel~="icon"\]'\)/);
  // دور ۷۸: به‌جای ساخت/حذف لینک، همان لینک سند بازاستفاده و فقط href عوض می‌شود.
  assert.match(favicon, /const iconSlot = \(\): HTMLLinkElement => \{/);
  assert.match(favicon, /v=\$\{versionOf\(value\)\}/);
  assert.match(favicon, /probe\.onerror/);
  assert.match(app, /return applyFavicon\(raw\)/);
  // نشانی رسانه از مسیر خودِ API می‌آید، نه `/storage` وابسته به لینک نمادین.
  assert.match(mediaUrl, /export function mediaUrl/);
  assert.match(mediaUrl, /\/media/);
});
