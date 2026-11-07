import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۷۷: پنج اصلاح تجربهٔ کاربری.
 *
 *  - آیکون/زمینهٔ سفید و رنگی به تب‌های «همه/تسک‌ها/پروژه‌ها/محتواها» تعلق داشت،
 *    نه تب‌های بازهٔ ماهانه/هفتگی؛ آن‌ها به ظاهر سادهٔ قبلی برگشتند.
 *  - پردهٔ لودینگ تکراری تصویر در مدال پیش‌نمایش حذف شد (لودینگ تصویر همان
 *    لودر خودِ `ImagePreview` است).
 *  - آیکون پیش‌فرض سایدبار با رنگ اصلی سامانه دیده می‌شود.
 *  - ردیف‌های «جدول اطلاعات» با اسکلت لودینگ و انیمیشن «مات → شفاف» می‌آیند.
 *  - کلیک روی عنوان/ردیفِ ناوبری در فهرست‌ها دیگر انیمیشن فشردن دکمه ندارد.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('../src/index.css');
const calendarViews = read('../src/components/calendar/CalendarViews.tsx');
const projectCalendar = read('../src/components/projects/ProjectCalendarView.tsx');
const stage = read('../src/components/content/StageAssetSections.tsx');
const imagePreview = read('../src/components/common/ImagePreview.tsx');
const sidebar = read('../src/components/layout/Sidebar.tsx');
const smartImage = read('../src/components/common/SmartImage.tsx');
const brandLogo = read('../src/components/common/BrandLogo.tsx');
const seriesView = read('../src/components/content/ContentSeriesView.tsx');
const workspaceList = read('../src/components/workspace/WorkspaceList.tsx');
const damLibrary = read('../src/components/dam/DamLibrary.tsx');

test('تب‌های بازهٔ تقویم به حالت قبلی برگشتند و تب‌های نوع رویداد آیکونی شدند', () => {
  // بازه: همان سه دکمهٔ متنی ساده، بدون آیکون و بدون زمینهٔ سفیدِ دورتادور.
  assert.match(calendarViews, /label: 'ماهانه', hint: 'همهٔ روزهای ماه' \}/);
  assert.doesNotMatch(calendarViews, /icon: CalendarDays/);
  assert.doesNotMatch(calendarViews, /icon: CalendarRange/);
  assert.doesNotMatch(calendarViews, /icon: CalendarClock/);
  // دور ۹۵: تب فعال متن سفید می‌گیرد و پس‌زمینهٔ رنگی را نشانگر متحرک می‌کشد.
  assert.match(calendarViews, /const rangeTabs = useSlidingTabs\(mode\);/);
  assert.match(calendarViews, /mode === item\.id \? 'text-white' : 'text-slate-500 hover:bg-slate-50'/);

  // نوع رویداد: هر تب آیکون دارد؛ انتخاب‌نشده سفید، انتخاب‌شده با رنگ اصلی.
  assert.match(projectCalendar, /icon: LucideIcon/);
  assert.match(projectCalendar, /icon: LayoutGrid \}/);
  assert.match(projectCalendar, /icon: CheckSquare \}/);
  assert.match(projectCalendar, /icon: FolderKanban \}/);
  assert.match(projectCalendar, /icon: FileText \}/);
  // دور ۸۴: نوار تب‌ها سفید است و تب فعال با رنگ اصلی سامانه پر می‌شود.
  assert.match(projectCalendar, /border border-slate-200 bg-white p-1\.5 shadow-2xs/);
  assert.match(projectCalendar, /const eventTabs = useSlidingTabs\(filter\);/);
  assert.match(projectCalendar, /'text-white'\s*\n?\s*:\s*'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'/);
  assert.match(projectCalendar, /'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'/);
});

test('مدال پیش‌نمایش تصویر فقط یک لودینگ دارد', () => {
  // پردهٔ اضافی «در حال لود تصویر… / تصویر با اندازهٔ کامل…» حذف شد.
  assert.doesNotMatch(stage, /<PreviewLoading label="در حال لود تصویر…"/);
  assert.doesNotMatch(stage, /تصویر با اندازهٔ کامل نمایش داده می‌شود\./);
  // تصویر مستقیم رندر می‌شود و لودینگش مال خودِ ImagePreview است.
  assert.match(stage, /payload\.mode === 'image' && \([\s\S]{0,420}<ImagePreview/);
  assert.match(imagePreview, /ui-skeleton absolute inset-0/);
  assert.match(imagePreview, /در حال لود تصویر…/);
});

test('آیکون پیش‌فرض سایدبار رنگی و هم‌رنگ رنگ اصلی سامانه است', () => {
  // کادر رنگی + آیکون پیش‌فرض، و لوگو روی آن بدون زمینهٔ خاکستری لودر.
  assert.match(sidebar, /bg-indigo-50 ring-1 ring-indigo-100 shadow-xs text-indigo-600/);
  assert.match(sidebar, /<Building2 className="w-5 h-5" \/>/);
  assert.match(sidebar, /plain/);
  assert.match(smartImage, /plain\?: boolean;/);
  assert.match(smartImage, /plain \? 'is-plain' : ''/);
  assert.match(brandLogo, /plain=\{plain\}/);
  assert.match(css, /\.ui-img\.is-plain \{ background: transparent; \}/);
});

test('ردیف‌های جدول اطلاعات با لودینگ و انیمیشن مات‌به‌شفاف می‌آیند', () => {
  assert.match(stage, /aria-label="در حال خواندن اطلاعات ردیف"/);
  assert.match(stage, /در حال خواندن اطلاعات ردیف از خود جدول…/);
  assert.match(stage, /className="ui-skeleton h-3\.5"/);
  assert.match(stage, /<div className="ui-clear-in space-y-3">/);
  assert.match(css, /@keyframes ui-clear-in \{[\s\S]{0,120}filter: blur\(6px\)/);
  assert.match(css, /\.ui-clear-in \{ animation: ui-clear-in/);
});

test('کلیک روی عنوان/ردیف ناوبری انیمیشن فشردن دکمه ندارد', () => {
  assert.match(css, /\[data-press='none'\]:active,/);
  assert.match(css, /button\[data-press='none'\]:active:not\(:disabled\),/);
  assert.match(css, /transform: none !important;\s*box-shadow: none !important;/);
  // نمونه‌های گزارش‌شده: عنوان محتوا در مجموعه و عنوان ردیف‌های فهرست‌ها.
  assert.equal(seriesView.match(/data-press="none"/g)?.length, 2);
  assert.match(workspaceList, /<button type="button" data-press="none" className=\{`\$\{className\} text-right`\} onClick=\{\(\) => app\.setSelectedTaskId/);
  assert.equal(damLibrary.match(/data-press="none"/g)?.length, 2);
});
