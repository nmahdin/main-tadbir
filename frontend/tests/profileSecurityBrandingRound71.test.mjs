import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * دور ۷۱: پالایش ظاهر و رفتار.
 *
 * این تست قراردادهای این دور را قفل می‌کند تا در تغییرات بعدی از دست نروند:
 * سایهٔ سبک‌تر دکمه‌ها، نشانهٔ «امروز» در انتخابگر تاریخ، انیمیشن خروج همهٔ
 * مدال‌ها، لود درست تصاویر پروفایل، حذف باکس «بار کاری» و دکمهٔ حذف کاربر،
 * رنگ اصلی در نوار پروفایل و صفحهٔ ورود، و تعریف رنگ دوم + لوگو/فاوآیکون.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('../src/index.css');
const avatar = read('../src/components/common/Avatar.tsx');
const mediaUrl = read('../src/utils/mediaUrl.ts');
const datePicker = read('../src/components/common/PersianDatePicker.tsx');
const profile = read('../src/components/users/UserProfileView.tsx');
const userModal = read('../src/components/users/UserModal.tsx');
const baleAccount = read('../src/components/bale/BaleAccountPanel.tsx');
const authModal = read('../src/components/auth/AuthModal.tsx');
const settingsView = read('../src/components/settings/SettingsView.tsx');
const appTsx = read('../src/App.tsx');
const orgSettings = readFileSync(new URL('../../backend/app/Services/Organization/OrganizationSettings.php', import.meta.url), 'utf8');
const challenge = readFileSync(new URL('../../backend/app/Services/BaleAuthChallenge.php', import.meta.url), 'utf8');

const walk = (dir) => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

test('the profile hero band and login title use the system primary color', () => {
  // نوار پروفایل دیگر مشکی نیست و رنگش از توکن رنگ اصلی سامانه می‌آید.
  assert.doesNotMatch(profile, /h-20 bg-slate-900/);
  assert.match(profile, /backgroundImage: 'linear-gradient\(115deg, var\(--color-primary\)/);
  // نوار عنوان صفحهٔ ورود یکدست و هم‌رنگ رنگ اصلی است (بدون گرادیان تیره).
  assert.doesNotMatch(authModal, /bg-gradient-to-br from-indigo-900 via-indigo-700 to-slate-900/);
  assert.match(authModal, /backgroundColor: 'color-mix\(in srgb, var\(--color-primary\) 88%, black\)'/);
});

test('profile drops the workload box and the user modal drops the delete button', () => {
  assert.doesNotMatch(profile, /بار کاری/);
  assert.match(profile, /sm:grid-cols-3/);
  assert.doesNotMatch(userModal, /حذف کاربر/);
  // حذف کاربر همچنان از فهرست کاربران ممکن است، نه از داخل مدال ویرایش.
  assert.doesNotMatch(userModal, /deleteUser/);
});

test('the Bale heartbeat explanatory sentence is gone from the account tab', () => {
  assert.doesNotMatch(baleAccount, /heartbeat/);
  assert.doesNotMatch(baleAccount, /بازیابی خطاهای موقت نیازمند scheduler فعال است/);
});

test('avatar images resolve against the API origin and fall back to initials', () => {
  assert.match(avatar, /import \{ mediaUrl \} from '\.\.\/\.\.\/utils\/mediaUrl';/);
  assert.match(avatar, /const avatarUrl = mediaUrl\(user\?\.avatar \|\| src\);/);
  assert.match(avatar, /onError=\{\(\) => setBrokenSrc\(avatarUrl\)\}/);
  // مسیر `/storage` نسبت به میزبان API معنا دارد، نه میزبان پنل.
  assert.match(mediaUrl, /SERVER_PATHS = \['\/storage\/'/);
  assert.match(mediaUrl, /return `\$\{apiOrigin\(\)\}\$\{normalized\}`;/);
});

test('today is marked in the date picker with a faint primary border', () => {
  assert.match(datePicker, /const todayJalali = parseToJalali\(new Date\(\)\);/);
  assert.match(datePicker, /const isToday = /);
  assert.match(datePicker, /aria-current=\{isToday \? 'date' : undefined\}/);
  // حاشیهٔ کم‌رنگ از رنگ اصلی سامانه ساخته می‌شود، نه یک رنگ ثابت.
  assert.match(datePicker, /borderColor: 'color-mix\(in srgb, var\(--color-primary\) 38%, transparent\)'/);
});

test('every hand-rolled modal keeps the element mounted while the exit animation runs', () => {
  const modals = walk(new URL('../src/components', import.meta.url).pathname)
    .filter(file => file.endsWith('.tsx'))
    .map(file => [file, readFileSync(file, 'utf8')])
    .filter(([, source]) => source.includes('ui-modal-overlay') || source.includes('ui-modal-panel'));
  assert.ok(modals.length >= 14, `expected the shared modal and 13 hand-rolled modals, saw ${modals.length}`);
  for (const [file, source] of modals) {
    assert.match(source, /presence\.visible/, `${file} must gate on presence.visible so «انصراف» animates`);
  }
});

test('password change validates locally and shows the server message', () => {
  assert.match(profile, /تکرار رمز عبور جدید/);
  assert.match(profile, /if \(newPassword !== confirmPassword\) \{/);
  assert.match(profile, /setPasswordError\(apiErrorMessage\(error, 'تغییر رمز عبور انجام نشد\.'\)\);/);
});

test('login errors are organized instead of raw server text', () => {
  const errors = read('../src/api/errors.ts');
  assert.match(errors, /export function loginErrorMessage\(error: unknown\): string \{/);
  assert.match(errors, /if \(status === 422\) return 'نام کاربری یا رمز عبور نادرست است\.';/);
  assert.match(errors, /const rateLimitMessage = \(error: unknown\): string => \{/);
  // صفحهٔ ورود برای خطای کد یک‌بارمصرف پیام دقیق سرور را نشان می‌دهد.
  assert.match(authModal, /setErrorMessage\(apiErrorMessage\(error, 'ارسال کد یک‌بارمصرف ناموفق بود\.'\)\);/);
});

test('unlinked accounts get an explicit "code cannot be sent" message', () => {
  assert.match(challenge, /امکان ارسال کد یک‌بارمصرف وجود ندارد/);
  assert.match(challenge, /private function deliverToPhone\(User \$user, string \$purpose\): bool/);
  assert.doesNotMatch(challenge, /if \(! \$user\?->isActive\(\) \|\| ! \$link\) \{\s*\n\s*return;/);
});

test('a second system color and branding uploads are organization settings', () => {
  assert.match(css, /--brand-secondary:/);
  assert.match(orgSettings, /'secondaryColor' => '/);
  assert.match(orgSettings, /'logoUrl' => ''/);
  assert.match(orgSettings, /'faviconUrl' => ''/);
  assert.match(orgSettings, /'value\.secondaryColor' => \['sometimes', 'string', 'regex:\/\^#\[0-9a-fA-F\]\{6\}\$\/'\]/);
  assert.match(settingsView, /settingsApi\.uploadBranding\(kind, file\)/);
  assert.match(settingsView, /رنگ دوم سامانه/);
  assert.match(appTsx, /style\.setProperty\('--brand-secondary', secondary\);/);
});
