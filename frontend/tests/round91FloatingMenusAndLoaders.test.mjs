import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = async (relative) => readFile(join(here, relative), 'utf8');

// ── ۱. حذف دایرهٔ زائد کنار گزینهٔ فعال وضعیت ──
test('گزینهٔ فعال منوی وضعیت مرحله دایرهٔ کوچک کنار متن ندارد', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');
  // فقط بدنهٔ منوی وضعیت بررسی می‌شود؛ نوار پیشرفت جریان جای دیگری چنین کلاسی دارد.
  const menuStart = detail.indexOf('stageStatusChoices.map');
  const menu = detail.slice(menuStart, detail.indexOf('</FloatingMenu>', menuStart));
  assert.ok(menuStart > -1 && menu.length > 0, 'بدنهٔ منوی وضعیت پیدا نشد');
  assert.doesNotMatch(menu, /rounded-full/);
  assert.doesNotMatch(menu, /h-1\.5 w-1\.5/);
  // تمایز گزینهٔ فعال با زمینهٔ اصلی و تیک باقی می‌ماند.
  assert.match(detail, /aria-selected=\{current\}/);
  assert.match(detail, /\{current && <Check className="h-3\.5 w-3\.5 shrink-0" \/>\}/);
  assert.match(detail, /<span className="flex items-center gap-1\.5">\{choice\.label\}<\/span>/);
});

// ── ۲. انیمیشن نرم باز و بستن منوهای شناور ──
test('منوهای شناور جریان محتوا از یک لایهٔ مشترک با انیمیشن ورود و خروج استفاده می‌کنند', async () => {
  const menu = await source('../src/components/common/FloatingMenu.tsx');
  assert.match(menu, /import \{ useExitPresence \} from '\.\/useExitPresence';/);
  assert.match(menu, /const presence = useExitPresence\(open\);/);
  // لبهٔ چسبیدن پنل هم با جهت منو هم‌راستا می‌شود (راست‌چین/چپ‌چین).
  assert.match(menu, /className=\{`ui-pop absolute top-full z-40 mt-1 \$\{origin === 'start' \? 'left-0' : 'right-0'\} \$\{className\}`\}/);
  assert.match(menu, /data-state=\{presence\.state\}/);
  // پوشش کلیک بیرون در حالت خروج، کلیک‌ها را نمی‌بلعد.
  assert.match(menu, /closing \? 'pointer-events-none opacity-0' : 'opacity-100'/);
  // گوشهٔ شروع انیمیشن قابل تنظیم است (منوی راست‌چین و چپ‌چین).
  assert.match(menu, /origin === 'start' \? 'top left' : 'top right'/);

  const detail = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(detail, /import \{ FloatingMenu \} from '\.\.\/common\/FloatingMenu';/);
  // وضعیت، مسئول، ارزیاب و تاریخ مهلت — هر چهار پنل از همین لایه می‌آیند.
  assert.match(detail, /closeLabel="بستن فهرست وضعیت مرحله"/);
  assert.match(detail, /closeLabel="بستن فهرست انتخاب فرد"/);
  assert.match(detail, /closeLabel="بستن انتخاب تاریخ"/);
  assert.match(detail, /origin="start"/);
  // پنل مسئول/ارزیاب با `open` رندر می‌شود (نه با شرط در والد) تا خروجش دیده شود.
  assert.match(detail, /const stagePersonPanel = \(stage: ContentStage, field: 'assignee' \| 'reviewer', open: boolean\) => \{/);
  assert.match(detail, /stagePersonPanel\(stage, 'assignee', stagePersonPicker\?\.stageId === stage\.id/);
  // رندر شرطی قدیمی دیگر وجود ندارد.
  assert.doesNotMatch(detail, /\{stagePersonPicker\?\.stageId === stage\.id && stagePersonPicker\.field === 'assignee' &&/);
});

test('کلاس منوی شناور انیمیشن کوتاه و نرم ورود و خروج دارد', async () => {
  const css = await source('../src/index.css');
  assert.match(css, /@keyframes ui-menu-in \{/);
  assert.match(css, /@keyframes ui-menu-out \{/);
  assert.match(css, /\.ui-pop \{\s*animation: ui-menu-in \.19s cubic-bezier\(\.22, 1, \.36, 1\) both;/);
  assert.match(css, /\.ui-pop\[data-state='closing'\] \{ animation: ui-menu-out \.13s/);
  assert.match(css, /transform-origin: top right;/);
  // حرکت کوتاه‌تر از انیمیشن مدال‌ها است تا پنل کوچک «نپرد».
  assert.match(css, /from \{ opacity: 0; transform: translateY\(4px\) scale\(\.96\) \}/);
});

test('تقویم حالت پنل انیمیشن دوباره ندارد و فقط لایهٔ والد می‌چرخد', async () => {
  const picker = await source('../src/components/common/PersianDatePicker.tsx');
  assert.match(picker, /panelOnly \? '' : ' animate-in fade-in zoom-in-95 duration-150'/);
});

// ── ۳. چرخندهٔ «خواندن همه» جابه‌جا نمی‌شود ──
test('چرخندهٔ علامت‌گذاری اعلان‌ها در خانهٔ ثابت می‌نشیند و برچسب عرض ثابت دارد', async () => {
  const notifications = await source('../src/components/notifications/NotificationsView.tsx');
  // خانهٔ ثابت آیکون: چرخنده و آیکون هم‌اندازه‌اند و جای هم می‌نشینند.
  assert.match(notifications, /<span className="grid h-4 w-4 shrink-0 place-items-center" aria-hidden>/);
  assert.match(notifications, /markingAll \? <LoaderCircle className="h-4 w-4 animate-spin" \/> : <CheckCheck/);
  // عرض برچسب با بلندترین متن رزرو می‌شود.
  assert.match(notifications, /<span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">در حال علامت‌گذاری…<\/span>/);
  // دکمهٔ هر اعلان هم همان خانهٔ ثابت را دارد.
  assert.match(notifications, /markingId === notification\.id \? <LoaderCircle className="h-4 w-4 animate-spin" \/> : <CheckCircle2/);

  const navbar = await source('../src/components/layout/TopNavbar.tsx');
  assert.match(navbar, /<span className="grid h-3\.5 w-3\.5 shrink-0 place-items-center" aria-hidden>/);
  assert.match(navbar, /readMutation\.isPending \? <LoaderCircle className="h-3\.5 w-3\.5 animate-spin" \/> : <span className="h-3\.5 w-3\.5" \/>/);
  assert.match(navbar, /className="invisible col-start-1 row-start-1 whitespace-nowrap">در حال علامت‌گذاری…/);
});

// ── ۴. سرعت چرخندهٔ لودینگ ──
test('چرخندهٔ لودینگ بزرگ صفحه و لودینگ کوچک صفحات سریع‌ترند', async () => {
  const feedback = await source('../src/components/common/Feedback.tsx');
  // سرعت فقط برای اندازه‌های سطح صفحه (lg/xl) زیاد می‌شود.
  assert.match(feedback, /size === 'lg' \|\| size === 'xl' \? 'ui-spin-fast' : ''/);
  assert.doesNotMatch(feedback, /sm.*ui-spin-fast/);
  // لودر تمام‌صفحه و لودینگ کوچک هر دو InlineSpinner با همین اندازه‌ها هستند.
  assert.match(feedback, /<InlineSpinner size="xl" className="text-white" \/>/);
  assert.match(feedback, /<InlineSpinner size=\{size\} className="text-indigo-600" \/>/);

  const css = await source('../src/index.css');
  // دور ۹۲: همان چرخش تالبویند با مدت کوتاه‌تر (کی‌فریم تازه لازم نیست).
  assert.match(css, /\.ui-spin-fast \{ animation-duration: \.45s !important; \}/);
  // نشانگر بارگذاری بخش‌ها/فهرست‌ها هم با همین سرعت می‌چرخد.
  const primitives = await source('../src/components/common/Primitives.tsx');
  assert.match(primitives, /<LoaderCircle className="ui-spin-fast h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden \/>/);
});
