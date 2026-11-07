import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ApiError, readMaintenanceState, isMaintenanceError } from '../src/api/errors.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * حالت تعمیر سامانه: تنها نقش «مدیریت کل سیستم» وارد می‌شود و بقیه — حتی با
 * نشستِ باز — صفحهٔ تعمیر می‌بینند، نه یک خطای عمومی ۵۰۳.
 */
test('حالت تعمیر: پاسخ ۵۰۳ سرور به وضعیت قابل‌نمایش تبدیل می‌شود', () => {
  const error = new ApiError('سامانه در حال تعمیر است.', 503, undefined, {
    code: 'maintenance_mode',
    message: 'سامانه در حال تعمیر است.',
    data: { maintenance: { enabled: true, message: 'به‌روزرسانی پایگاه‌داده تا ساعت ۱۴', startedAt: '2026-10-24T08:00:00+03:30' } },
  });

  const state = readMaintenanceState(error);
  assert.equal(state?.enabled, true);
  assert.equal(state?.message, 'به‌روزرسانی پایگاه‌داده تا ساعت ۱۴');
  assert.equal(state?.startedAt, '2026-10-24T08:00:00+03:30');
  assert.equal(isMaintenanceError(error), true);

  // پیام خالی هرگز صفحهٔ بی‌متن نمی‌سازد.
  const withoutMessage = new ApiError('', 503, undefined, { code: 'maintenance_mode', message: '', data: { maintenance: { enabled: true, message: '' } } });
  assert.match(readMaintenanceState(withoutMessage)?.message || '', /در حال تعمیر است/);

  // خطای ۵۰۳ غیرمرتبط، حالت تعمیر نیست.
  const unrelated = new ApiError('عملیات انجام نشد.', 503, undefined, { message: 'عملیات انجام نشد.' });
  assert.equal(readMaintenanceState(unrelated), null);
  assert.equal(readMaintenanceState(new ApiError('نشست', 401)), null);
});

test('حالت تعمیر: لایهٔ API پیام و کد سرور را حفظ می‌کند', async () => {
  const [client, errors] = await Promise.all([source('../src/api/client.ts'), source('../src/api/errors.ts')]);

  // ۵xx معمولاً به پیام عمومی تبدیل می‌شود؛ برای حالت تعمیر پیام و payload باید بماند.
  assert.match(client, /const keepServerDetailFor = \(payload: any\): boolean =>/);
  assert.match(client, /payload\?\.code === 'maintenance_mode'/);
  assert.match(client, /announceMaintenanceMode/);
  assert.match(client, /new CustomEvent\('tadbir:maintenance-mode'/);

  assert.match(errors, /export function readMaintenanceState/);
  assert.match(errors, /payload\.code !== 'maintenance_mode'\) return null/);
  assert.match(errors, /const maintenance = payloadCode === 'maintenance_mode';/);
});

test('حالت تعمیر: بک‌اند فقط نقش مدیریت کل سیستم را عبور می‌دهد', async () => {
  const [middleware, routes, settings, auth, systemController, bootstrap] = await Promise.all([
    source('../../backend/app/Http/Middleware/EnsureMaintenanceMode.php'),
    source('../../backend/routes/api.php'),
    source('../../backend/app/Services/Organization/OrganizationSettings.php'),
    source('../../backend/app/Http/Controllers/Api/V1/AuthController.php'),
    source('../../backend/app/Http/Controllers/Api/V1/SystemSettingController.php'),
    source('../../backend/bootstrap/app.php'),
  ]);

  // میان‌افزار: خروج از حساب و نقش مدیریت کل سیستم استثنا هستند.
  assert.match(middleware, /class EnsureMaintenanceMode/);
  assert.match(middleware, /routeIs\('api\.v1\.auth\.logout'\)/);
  assert.match(middleware, /request->user\(\)\?->isAdmin\(\)/);
  assert.match(middleware, /return \$this->mode->response\(\);/);

  // روی همهٔ مسیرهای احراز‌شده فعال است.
  assert.match(bootstrap, /'maintenance-mode' => EnsureMaintenanceMode::class/);
  assert.match(routes, /'auth:sanctum', 'active-account', 'maintenance-mode'/);

  // تنظیمات: کلید اختصاصی، پیش‌فرض خاموش، و نوشتن فقط با نقش admin.
  assert.match(settings, /'maintenance' => \[/);
  assert.match(settings, /'enabled' => false,/);
  assert.match(settings, /if \(\$key === 'maintenance'\) \{\s*return \$actor->isAdmin\(\);/);
  assert.match(settings, /'value' => \['present', 'array:enabled,message,startedAt,updatedBy'\]/);

  // ورود و ثبت‌نام هم مسدود می‌شوند، نه فقط API.
  assert.match(auth, /private function maintenanceBlockFor\(User \$user\): \?JsonResponse/);
  assert.match(auth, /if \(\$blocked = \$this->maintenanceBlockFor\(\$user\)\)/);
  assert.match(auth, /return \$maintenance->response\('سامانه در حال تعمیر است؛ در این مدت امکان ثبت‌نام جدید وجود ندارد\.'\)/);

  // صفحهٔ ورود پیش از احراز هویت، وضعیت تعمیر را می‌گیرد.
  assert.match(systemController, /'maintenance' => app\(MaintenanceMode::class\)->publicState\(\)/);
  assert.match(systemController, /'Cache-Control' => 'no-store, private'/);
  // مهر زمان و نام تغییردهنده را سرور می‌نویسد.
  assert.match(systemController, /\$value\['startedAt'\] = \$enabled/);
  assert.match(systemController, /\$value\['updatedBy'\] = \$actor->name;/);
});

test('حالت تعمیر: رابط کاربری صفحهٔ تعمیر و کلید تنظیمات را نشان می‌دهد', async () => {
  const [screen, protectedRoute, app, authContext, panel, settingsView] = await Promise.all([
    source('../src/components/maintenance/MaintenanceScreen.tsx'),
    source('../src/routing/ProtectedRoute.tsx'),
    source('../src/App.tsx'),
    source('../src/context/AuthContext.tsx'),
    source('../src/components/settings/MaintenanceModePanel.tsx'),
    source('../src/components/settings/SettingsView.tsx'),
  ]);

  // صفحهٔ تعمیر: پیام مدیر، زمان شروع و راه خروج/ورود مدیر.
  assert.match(screen, /export const MaintenanceScreen/);
  assert.match(screen, /سامانه در حال تعمیر است/);
  assert.match(screen, /ورود مدیر کل سیستم/);
  assert.match(screen, /خروج از حساب/);
  assert.match(screen, /role="alert"/);

  // مسیرهای محافظت‌شده و صفحهٔ ورود، پیش از هر چیز حالت تعمیر را می‌بینند.
  assert.match(protectedRoute, /maintenance\?\.enabled && currentUser\.role !== 'admin'/);
  assert.match(protectedRoute, /<MaintenanceScreen/);
  assert.match(app, /maintenance\?\.enabled && !showAdminLogin/);
  assert.match(app, /onAdminLogin=\{\(\) => setShowAdminLogin\(true\)\}/);

  // وضعیت از سرور خوانده و از رویداد ۵۰۳ هم به‌روز می‌شود.
  assert.match(authContext, /const \[maintenance, setMaintenance\] = useState<MaintenanceState \| null>\(null\)/);
  assert.match(authContext, /readMaintenanceState\(error\)/);
  assert.match(authContext, /'tadbir:maintenance-mode'/);
  assert.match(authContext, /settingsApi\.publicIdentity\(\)/);

  // پنل تنظیمات: تأیید پیش از روشن‌شدن و ذخیره روی کلید maintenance.
  assert.match(panel, /settingsApi\.get<MaintenanceValue>\('maintenance'\)/);
  assert.match(panel, /settingsApi\.update<MaintenanceValue>\('maintenance', \{/);
  assert.match(panel, /بله، حالت تعمیر را روشن کن/);
  assert.match(panel, /currentUser\.role === 'admin'/);
  assert.match(settingsView, /\{ id: 'maintenance', label: 'حالت تعمیر'/);
  assert.match(settingsView, /activeTab === 'maintenance' && <MaintenanceModePanel \/>/);
});
