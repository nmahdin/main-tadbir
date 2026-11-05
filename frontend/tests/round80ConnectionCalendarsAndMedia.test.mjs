import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۸۰ — پیام قطعی اینترنت خودش بررسی می‌کند، تصویر خروجی تا دیده‌شدن
 * کارت لود نمی‌شود، ویدیو ابعاد و بارگیری اولیه دارد، تب‌های تقویم بی‌شمارنده
 * شده‌اند و پیش‌فرض موبایل «سه‌هفتگی» است.
 *
 * گزارش کاربر: «پیام قطعی اینترنت باید به‌صورت خودکار پنهان شود و خودش بررسی
 * اتصال را داشته باشد»؛ «این لودینگ تصویر تا کارت را ندیده‌ام لود نشود»؛ «قبل
 * از مشخص‌شدن ابعاد ویدیو، پخش‌کننده ابعاد مشخص و لودینگ داشته باشد»؛ «تعداد
 * تب‌های تقویم را نشان نده»؛ «تقویم موبایل پیش‌فرض سه‌هفتگی»؛ و «در مدال
 * پیش‌نمایش، پیام در حال آماده‌سازی تا کلیک نمی‌رود».
 */
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const banner = read('../src/components/common/ConnectionBanner.tsx');
const connection = read('../src/utils/connectionState.ts');
const context = read('../src/context/AppContext.tsx');
const errors = read('../src/api/errors.ts');
const stage = read('../src/components/content/StageAssetSections.tsx');
const inView = read('../src/hooks/useInView.ts');
const player = read('../src/components/common/MediaPlayer.tsx');
const calendarViews = read('../src/components/calendar/CalendarViews.tsx');
const projectCalendar = read('../src/components/projects/ProjectCalendarView.tsx');

test('پیام قطعی اینترنت خودش چند بار اتصال را بررسی می‌کند', () => {
  assert.match(connection, /export async function probeConnection/);
  assert.match(connection, /fetch\(`\$\{runtime\.apiUrl\}\/health`/);
  // بررسی اتصال نباید کوکی/نشست بسازد و نباید از کش خوانده شود.
  assert.match(connection, /credentials: 'omit'/);
  assert.match(connection, /cache: 'no-store'/);
  assert.match(connection, /new AbortController\(\)/);

  // سه تلاش خودکار پلکانی.
  assert.match(banner, /const AUTO_RETRY_DELAYS = \[2000, 6000, 12000\];/);
  assert.match(banner, /const MAX_AUTO_ATTEMPTS = AUTO_RETRY_DELAYS\.length;/);
  assert.match(banner, /if \(!offline \|\| autoAttempts >= MAX_AUTO_ATTEMPTS\) return;/);
  assert.match(banner, /if \(!reachable\) setAutoAttempts\(previous => previous \+ 1\);/);
});

test('پس از تلاش‌های خودکار، پیام جمع می‌شود و فقط با دکمه بررسی می‌شود', () => {
  assert.match(banner, /const exhausted = autoAttempts >= MAX_AUTO_ATTEMPTS;/);
  assert.match(banner, /if \(exhausted && !checking\) \{/);
  assert.match(banner, /اتصال برقرار نشد؛ بررسی خودکار متوقف شد\./);
  assert.match(banner, /بررسی اتصال/);
  // هیچ تلاش خودکاری بعد از سقف اجرا نمی‌شود (حلقه با همان شرط بسته است).
  assert.doesNotMatch(banner, /setInterval\(/);
});

test('با برگشتن اتصال، پیام خودکار پنهان و داده‌ها تازه می‌شوند', () => {
  assert.match(banner, /if \(reachable\) \{[\s\S]{0,200}setRestored\(true\);/);
  assert.match(banner, /void queryClient\.refetchQueries\(\{ type: 'active' \}\);/);
  assert.match(banner, /window\.setTimeout\(\(\) => setRestored\(false\), 3200\);/);
  // نوار فقط با وضعیت مشترک ظاهر می‌شود؛ نه با شمارندهٔ خطاهای هر صفحه.
  assert.match(banner, /if \(!offline && !restored\) return null;/);
});

test('«ذخیره تنظیمات ناموفق بود» دیگر با قطعی اینترنت نمایش داده نمی‌شود', () => {
  // تفکیک «نرسیدن» از «نپذیرفتن».
  assert.match(errors, /export const isConnectionFailure = \(error: unknown\): boolean =>/);
  assert.match(context, /const offline = isConnectionFailure\(error\);/);
  assert.match(context, /networkFailures\.push\(key\);/);
  assert.match(context, /if \(networkFailures\.length > 0 && failures\.length === 0\) \{/);
  // خطای شبکه بی‌صدا می‌ماند و با برگشتن اتصال دوباره فرستاده می‌شود.
  assert.match(context, /pendingSettingsKeys\.current\.add\(key\);/);
  assert.match(context, /return subscribeConnection\(offline => \{[\s\S]{0,220}void saveSettingsNowRef\.current\(\);/);
  // مقدارِ ردشده تا تغییر نکردن دوباره فرستاده نمی‌شود (پایان پیام‌های تکراری).
  assert.match(context, /rejectedSettingsPayloads\.current\.get\(key\) === serialized/);
  assert.match(context, /rejectedSettingsPayloads\.current\.set\(key, serialized\);/);
  // پیام خطا صریح می‌گوید مشکل از اینترنت نیست.
  assert.match(context, /این خطا از قطعی اینترنت نیست؛ مقدار این کلیدها را سرور نپذیرفت\./);
});

test('الگوی فرایند پس از نرمال‌سازی «تغییرکرده» به نظر نمی‌رسد', () => {
  // خط مبنا از همان مقدار نرمال‌شدهٔ رابط کاربری ساخته می‌شود؛ وگرنه هر نشست
  // بی‌هیچ ویرایشی process_templates را دوباره می‌فرستاد.
  assert.match(context, /key === 'process_templates'\s*\?\s*normalizeProcessTemplates\(value\)/);
  assert.match(context, /if \(Array\.isArray\(settingsData\.process_templates\)\) setProcessTemplates\(normalizeProcessTemplates\(settingsData\.process_templates\)\);/);
});

test('تصویر کارت خروجی تا دیده‌شدن کارت لود نمی‌شود', () => {
  assert.match(inView, /export function useInView/);
  assert.match(inView, /new IntersectionObserver\(entries => \{/);
  assert.match(inView, /rootMargin = '240px'/);
  // کارت: قلاب روی خود کارت و درخواست تصویر پشت «دیده‌شدن».
  assert.match(stage, /const \[cardRef, cardSeen\] = useInView<HTMLElement>\(\{ rootMargin: '260px' \}\);/);
  assert.match(stage, /\{showsImage && previewSrc && cardSeen && \(/);
  // تا آن لحظه همان کادر خالی با ارتفاع ثابت نگه داشته می‌شود (بدون پرش چیدمان).
  assert.match(stage, /\{showsImage && previewSrc && !cardSeen && \(/);
  assert.match(stage, /<article ref=\{cardRef as React\.RefObject<HTMLElement>\}/);
});

test('پخش‌کنندهٔ ویدیو پیش از ابعاد واقعی، کادر ثابت و لودینگ دارد', () => {
  // نسبت ۱۶:۹ و پس‌زمینهٔ سیاه تا روشن‌شدن تصویر.
  assert.match(player, /aspect-video w-full max-h-\[62dvh\]/);
  assert.match(player, /overflow-hidden rounded-2xl border border-slate-200 bg-black/);
  assert.match(player, /const videoClass = `block bg-black object-contain/);
  assert.match(player, /'در حال آماده‌سازی ویدیو…'/);
  assert.match(player, /'در حال بارگذاری ویدیو…'/);
});

test('ویدیو از آغاز کمی بارگیری می‌شود تا پیام آماده‌سازی نماند', () => {
  // پیش‌فرض ویدیو `auto` است (چند صد کیلوبایت اول، همراه با پشتیبانی Range).
  assert.match(player, /setPreload\(isVideo \? 'auto' : 'none'\);/);
  assert.match(player, /setPreload\(isVideo \? 'auto' : 'none'\);\n      return;/);
  // نگهبان: اگر فراداده نرسید، دو بار بارگذاری دوباره و سپس دکمهٔ دستی.
  assert.match(player, /const retryAt = \[4000, 9000\];/);
  assert.match(player, /if \(node\.readyState >= 1\) return;/);
  assert.match(player, /if \(index === retryAt\.length - 1\) setSlow\(true\);/);
  assert.match(player, /\{slow && \(/);
  assert.match(player, /بارگذاری دوباره/);
});

test('تب‌های تقویم شمارندهٔ تعداد ندارند', () => {
  assert.match(projectCalendar, /const tabs: Array<\{ value: CalendarFilter; label: string; icon: LucideIcon \}> = \[/);
  assert.doesNotMatch(projectCalendar, /tab\.count/);
  assert.doesNotMatch(projectCalendar, /count: allEvents\.length/);
  // خود تب‌ها می‌مانند.
  assert.match(projectCalendar, /label: 'همه'/);
  assert.match(projectCalendar, /label: 'تسک‌ها'/);
  assert.match(projectCalendar, /label: 'پروژه‌ها'/);
  assert.match(projectCalendar, /label: 'محتواها'/);
});

test('تقویم روی موبایل پیش‌فرض سه‌هفتگی است', () => {
  assert.match(calendarViews, /export const MOBILE_CALENDAR_QUERY = '\(max-width: 639px\)';/);
  assert.match(calendarViews, /export const defaultCalendarRangeMode = \(\): CalendarRangeMode =>/);
  assert.match(calendarViews, /window\.matchMedia\(MOBILE_CALENDAR_QUERY\)\.matches[\s\S]{0,60}\? 'threeWeeks'/);
  for (const path of [
    '../src/components/projects/ProjectCalendarView.tsx',
    '../src/components/content/PublishingCalendar.tsx',
    '../src/components/content/SeriesCalendar.tsx',
    '../src/components/tasks/MyTasksView.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /useState<CalendarRangeMode>\(defaultCalendarRangeMode\)/, path);
    assert.doesNotMatch(source, /useState<CalendarRangeMode>\('month'\)/, path);
  }
});
