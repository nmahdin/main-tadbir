import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/** هر نوار تبی که در دور ۹۵ نشانگر متحرک گرفت. */
const STRIPS = [
  '../src/components/archive/ArchiveView.tsx',
  '../src/components/bale/BaleSettingsPanel.tsx',
  '../src/components/calendar/CalendarViews.tsx',
  '../src/components/common/AttachmentComposer.tsx',
  '../src/components/content/ContentDetailView.tsx',
  '../src/components/content/ContentSeriesView.tsx',
  '../src/components/departments/DepartmentDashboardView.tsx',
  '../src/components/projects/ProjectCalendarView.tsx',
  '../src/components/projects/ProjectDetailView.tsx',
  '../src/components/settings/SettingsView.tsx',
  '../src/components/tasks/MyTasksView.tsx',
  '../src/components/thought-room/ThoughtRoomMainView.tsx',
  '../src/components/workspace/WorkspaceList.tsx',
];

test('نشانگر تب‌ها مختصات تب فعال را اندازه می‌گیرد و با ترنسفورم می‌لغزد', async () => {
  const [hook, css] = await Promise.all([source('../src/components/common/SlidingTabs.tsx'), source('../src/index.css')]);

  // مختصات از rect گرفته می‌شود تا راست‌به‌چپ، شبکه و نوار اسکرول‌شو هم درست باشد.
  assert.match(hook, /const stripBox = strip\.getBoundingClientRect\(\);/);
  assert.match(hook, /const target = active\.getBoundingClientRect\(\);/);
  assert.match(hook, /left: target\.left - stripBox\.left - strip\.clientLeft,/);
  assert.match(hook, /top: target\.top - stripBox\.top - strip\.clientTop,/);
  assert.match(hook, /strip\.querySelector<HTMLElement>\('\[data-tab-active="true"\]'\)/);

  // حرکت با `transform` است (نه left/top) تا چیدمان دوباره حساب نشود.
  assert.match(hook, /transform: `translate\(\$\{box\.left\}px, \$\{box\.top\}px\)`,/);
  assert.match(hook, /className=\{`ui-tab-pill pointer-events-none absolute left-0 top-0 z-0 \$\{SLIDING_TAB_TONES\[tone\]\}`\}/);

  // قبل از اولین اندازه‌گیری انتقال خاموش است تا نشانگر از گوشه نوار پرواز نکند.
  assert.match(hook, /useLayoutEffect\(\(\) => \{\s*\n\s*measure\(\);/);
  // اصلاح اندازه پس از پایان انیمیشن بازشدن مدال/پنل و پس از بارگذاری فونت.
  assert.match(hook, /const soon = window\.setTimeout\(measure, 220\);/);
  assert.match(hook, /void fonts\?\.ready\?\.then\(\(\) => measure\(\)\)/);
  assert.match(hook, /requestAnimationFrame\(\(\) => setAnimated\(true\)\)/);
  assert.match(hook, /data-state=\{animated \? 'moving' : 'idle'\}/);

  // با تغییر اندازهٔ نوار/تب و متن شمارنده‌ها دوباره اندازه می‌گیرد.
  assert.match(hook, /new ResizeObserver/);
  assert.match(hook, /new MutationObserver/);

  // انیمیشن نرم و کوتاه، و احترام به کاهش حرکت.
  assert.match(css, /\.ui-tab-pill \{/);
  assert.match(css, /\.ui-tab-pill\[data-state='moving'\] \{\s*\n\s*transition:/);
  assert.match(css, /transform \.26s cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(css, /width \.26s cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(css, /\.ui-tab-pill, \.ui-tab-pill\[data-state='moving'\] \{ transition: none !important; \}/);
});

test('هر نوار تب صفحه‌ها نشانگر متحرک گرفته و تب فعال کلاس رنگی خودش را از دست داده', async () => {
  const files = await Promise.all(STRIPS.map(source));

  files.forEach((file, index) => {
    const name = STRIPS[index];
    assert.match(file, /from '\.\.?\/?(?:common\/)?SlidingTabs'/, `${name} باید هوک نشانگر را وارد کند`);
    assert.match(file, /useSlidingTabs\(/, `${name} باید نوار تبش را به نشانگر وصل کند`);
    assert.match(file, /\.stripRef\b/, `${name} باید ref را روی ظرف تب‌ها بگذارد`);
    assert.match(file, /\.pill\}/, `${name} باید نشانگر را داخل نوار رندر کند`);
    assert.match(file, /data-tab-active=/, `${name} باید تب فعال را برای اندازه‌گیری علامت بزند`);
    // ظرف تب‌ها باید `relative` باشد تا مختصات نسبت به خودش حساب شود.
    assert.match(file, /\.stripRef\}[^>]*className="[^"]*\brelative\b/, `${name} ظرف تب‌ها باید relative باشد`);
    // همان کلاس رنگی ممکن است جای دیگری (نشانگر «امروز»، شمارهٔ مرحله) بماند؛
    // پس فقط هم‌رنگی متن تب فعال بررسی می‌شود، نه نبودن رنگ در کل فایل.
    // در نوارهای روشن (بله، حالت‌های جدول) نشانگر سفید است و متن تب فعال
    // بنفش می‌ماند؛ در بقیه، متن تب فعال سفید می‌شود.
    const lightTone = name.endsWith('/bale/BaleSettingsPanel.tsx') || name.endsWith('/common/AttachmentComposer.tsx');
    assert.match(file, lightTone ? /'text-indigo-700'/ : /'text-white'/, `${name} متن تب فعال باید هم‌رنگ نشانگر بماند`);
  });
});

test('سه رنگ نشانگر برای نوارهای روشن، تیره و اصلی', async () => {
  const hook = await source('../src/components/common/SlidingTabs.tsx');

  assert.match(hook, /primary: 'bg-indigo-600 shadow-sm shadow-indigo-600\/25',/);
  assert.match(hook, /slate: 'bg-slate-700 shadow-sm shadow-slate-700\/25',/);
  assert.match(hook, /light: 'bg-white shadow-xs',/);
  assert.match(hook, /outlined: 'bg-white shadow-sm ring-1 ring-slate-200',/);

  // نوارهای روشن و تیره رنگ خودشان را صریح انتخاب می‌کنند.
  assert.match(await source('../src/components/archive/ArchiveView.tsx'), /useSlidingTabs\(activeTab, 'slate'\)/);
  assert.match(await source('../src/components/common/AttachmentComposer.tsx'), /useSlidingTabs\(activeTableOperation, 'light'\)/);
  assert.match(await source('../src/components/bale/BaleSettingsPanel.tsx'), /useSlidingTabs\(activeTab, 'light'\)/);
  assert.match(await source('../src/components/tasks/MyTasksView.tsx'), /useSlidingTabs\(viewMode, 'outlined'\)/);
});
