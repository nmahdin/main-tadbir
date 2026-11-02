import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const backend = path => readFileSync(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

const published = source('components/content/ContentPublishedView.tsx');
const analytics = source('components/analytics/AnalyticsView.tsx');
const analyticsController = backend('app/Http/Controllers/Api/V1/AnalyticsController.php');
const projectDetail = source('components/projects/ProjectDetailView.tsx');
const context = source('context/AppContext.tsx');
const listQuery = source('routing/listQuery.ts');
const priorityPill = source('components/common/PriorityPill.tsx');
const thoughtRoom = source('components/thought-room/ThoughtRoomMainView.tsx');
const menuRouter = backend('app/Bot/Bale/Routing/MenuRouter.php');

/**
 * دور ۶۴: فهرست محتوای منتشرشده، گزارش‌ها و تحلیل‌ها، نام وضعیت «در انتظار بررسی»
 * و عرض سربرگ صفحهٔ جزئیات پروژه.
 */
test('فهرست محتوای منتشرشده: بدون نام مسئول اصلی، بدون ستون وضعیت، عملیات آیکونی', () => {
  // فقط عنوان، نوع، ناشر، تاریخ انتشار و عملیات می‌ماند.
  const headers = [...published.matchAll(/<th className="[^"]*">([^<]+)<\/th>/g)].map(match => match[1]);
  assert.deepEqual(headers, ['عنوان محتوا', 'نوع', 'ناشر', 'تاریخ و ساعت انتشار', 'عملیات']);

  // رنگ نشانگر نوع از تنظیمات همان نوع می‌آید.
  assert.match(published, /const typeSetting = contentTypes\.find\(ct => ct\.id === content\.type\);/);
  assert.match(published, /<ContentTypeBadge color=\{typeSetting\?\.color\} label=\{typeName\} \/>/);
  assert.doesNotMatch(published, /bg-emerald-50 px-2\.5 py-1/);

  // دکمه‌های عملیات: کپی و بایگانی فقط آیکون با tooltip، «لغو انتشار» تنها متن‌دار.
  assert.match(published, /title="ساخت یک کپی از محتوا"[\s\S]{0,120}aria-label="ساخت یک کپی از محتوا"[\s\S]{0,120}className="ui-action-button ui-icon-button"/);
  assert.match(published, /title="بایگانی محتوا"[\s\S]{0,120}aria-label="بایگانی محتوا"[\s\S]{0,120}className="ui-action-button ui-icon-button"/);
  assert.match(published, /title="لغو انتشار"[\s\S]{0,220}<span>لغو انتشار<\/span>/);
  assert.equal((published.match(/<span>کپی<\/span>|<span>بایگانی<\/span>/g) || []).length, 0);

  // سلول‌ها بدون وضعیت و بدون مسئول اصلی.
  assert.doesNotMatch(published, /ContentStatusBadge/);
  assert.doesNotMatch(published, /content\.ownerId/);
});

test('گزارش‌ها: کارتابل نامه و بار کاری حذف شد و جلسات جای آن‌ها آمد', () => {
  // هیچ نشانی از نامه‌ها یا نمودار بار کاری دپارتمان‌ها در صفحه نیست.
  assert.doesNotMatch(analytics, /نامه‌ها|کارتابل|respondedLetters|totalLetters/);
  assert.doesNotMatch(analytics, /بار کاری|avgWorkload|departmentWorkload|Users2/);
  assert.doesNotMatch(analytics, /reports\.letters/);

  // کارت شاخص جلسات: تعداد کل و برگزارشده‌ها.
  assert.match(analytics, /<p className="text-sm font-bold text-slate-700">جلسات<\/p>/);
  assert.match(analytics, /formatPersianNumber\(totalMeetings\)/);
  assert.match(analytics, /formatPersianNumber\(completedMeetings\)/);
  assert.match(analytics, /const totalMeetings = report\.meetings\.total;/);

  // نمودار/فهرست وضعیت جلسات با تعداد هر وضعیت.
  assert.match(analytics, /const MEETING_STATUS_TONES[\s\S]{0,400}\{ id: 'scheduled'[\s\S]{0,400}\{ id: 'completed'/);
  assert.match(analytics, /value: report\.meetings\.byStatus\[tone\.id\] \|\| 0/);
  assert.match(analytics, /<span>وضعیت جلسات<\/span>/);
  assert.match(analytics, /<span className="text-xs font-black text-teal-800">تعداد کل جلسات<\/span>/);
  assert.match(analytics, /navigate\('\/thought-room\?tab=meetings'\)/);
});

test('گزارش‌ها: آمار انواع محتوا و وضعیت ایده از دادهٔ واقعی تنظیمات می‌آید', () => {
  // انواع محتوا از تنظیمات سامانه (نام و رنگ خودِ نوع) ساخته می‌شود.
  assert.match(analytics, /const contentTypeData = contentTypes[\s\S]{0,200}report\.contents\.byType\[type\.id\] \|\| 0[\s\S]{0,120}type\.color \|\| '#6366f1'/);
  assert.doesNotMatch(analytics, /byType\.video|byType\.article|byType\.podcast|byType\.social_post/);
  assert.match(analytics, /data=\{contentTypeChart\}/);
  assert.match(analytics, /navigate\(`\/contents\?type=\$\{encodeURIComponent\(item\.id\)\}`\)/);

  // وضعیت‌های واقعی ایده؛ «در حال بررسی»ِ ساختگی و کلید ناموجود in_review حذف شد.
  assert.doesNotMatch(analytics, /byStatus\.in_review/);
  assert.match(analytics, /const IDEA_STATUS_TONES[\s\S]{0,600}\{ ids: \['submitted'\][\s\S]{0,600}\{ ids: \['under_review'\][\s\S]{0,600}\{ ids: \['needs_info'\]/);
  assert.match(analytics, /report\.ideas\.byStatus\[id\] \|\| 0/);

  // وضعیت وظایف از تنظیمات سازمان (برچسب و رنگ) خوانده می‌شود، نه از فهرست ثابت.
  assert.match(analytics, /const statusData = taskStatuses[\s\S]{0,200}report\.tasks\.byStatus\[status\.id\] \|\| 0[\s\S]{0,80}status\.color/);
  assert.doesNotMatch(analytics, /name: 'بک‌لاگ'/);
  assert.match(analytics, /navigate\(`\/tasks\?status=\$\{encodeURIComponent\(item\.id\)\}`\)/);
});

test('وضعیت بک‌لاگ همه‌جا «در انتظار بررسی» نام دارد', () => {
  assert.match(context, /\{ id: 'backlog', label: 'در انتظار بررسی', color: '#94a3b8', order: 1 \},/);
  assert.match(listQuery, /backlog: 'در انتظار بررسی'/);
  assert.match(priorityPill, /backlog: \{ label: 'در انتظار بررسی', color: '#64748b' \}/);
  assert.match(projectDetail, /tasks: \[\['backlog', 'در انتظار بررسی'\]/);
  assert.match(menuRouter, /'backlog' => 'در انتظار بررسی'/);
  // برچسب قبلی هیچ‌جا نمانده است.
  for (const [name, text] of Object.entries({ context, listQuery, priorityPill, menuRouter })) {
    assert.doesNotMatch(text, /در صف بررسی/, `${name} هنوز برچسب قدیمی را دارد`);
  }
});

test('سربرگ صفحهٔ جزئیات پروژه تمام عرض کارت را می‌گیرد', () => {
  // هیچ بخشی از سربرگ با max-w-3xl باریک نشده است.
  const header = projectDetail.slice(projectDetail.indexOf('<div className="p-5 sm:p-7">'), projectDetail.indexOf('</section>', projectDetail.indexOf('<div className="p-5 sm:p-7">')));
  assert.doesNotMatch(header, /max-w-3xl/);
  // چهار کارت اطلاعات در یک شبکهٔ هم‌عرض (۲ ستون موبایل، ۴ ستون دسکتاپ).
  assert.match(header, /<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">/);
  for (const label of ['مدیر پروژه', 'بازه پروژه', 'اعضای پروژه', 'دسته‌بندی پروژه']) {
    assert.match(header, new RegExp(label));
  }
  // نوار پیشرفت هم عرض کامل کارت است.
  assert.match(header, /<div className="mt-6 border-t border-slate-100 pt-4">/);
});

test('آمار سرور جلسات را برمی‌گرداند و تأیید ایده را درست می‌شمارد', () => {
  assert.match(analyticsController, /->where\('kind', WorkspaceRecord::KIND_MEETING\)/);
  assert.match(analyticsController, /'meetings' => \[[\s\S]{0,220}'byStatus' => \$meetingStatuses/);
  // «تأییدشده» شامل مراحل بعد از تأیید است و کلید ناموجود converted حذف شد.
  assert.match(analyticsController, /status IN \('approved', 'in_progress', 'implemented', 'completed'\)/);
  assert.doesNotMatch(analyticsController, /'converted'/);
});

test('پیوند ?tab=meetings تب جلسات اتاق فکر را باز می‌کند', () => {
  assert.match(thoughtRoom, /const \[searchParams\] = useSearchParams\(\);/);
  assert.match(thoughtRoom, /if \(searchParams\.get\('tab'\) === 'meetings' && canViewMeetings\) return 'meetings';/);
});
