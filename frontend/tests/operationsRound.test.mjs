import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('نگهداری بدون SSH: پشتیبان‌گیری و بازگردانی از پنل با مجوز تنظیمات', async () => {
  const [routes, controller, settings, provider] = await Promise.all([
    source('../../backend/routes/api.php'),
    source('../../backend/app/Http/Controllers/Api/V1/AdminMaintenanceController.php'),
    source('../../backend/app/Support/Storage/StorageSettings.php'),
    source('../../backend/app/Providers/AppServiceProvider.php'),
  ]);

  // مسیرهای نگهداری پنل همه پشت مجوز مدیریت تنظیمات‌اند
  assert.match(routes, /Route::prefix\('maintenance'\)->middleware\('permission:settings\.manage'\)/);
  for (const route of [
    /Route::get\('overview', \[AdminMaintenanceController::class, 'overview'\]\)/,
    /Route::post\('database-backups', \[AdminMaintenanceController::class, 'createBackup'\]\)/,
    /Route::get\('database-backups\/\{file\}\/download', \[AdminMaintenanceController::class, 'downloadBackup'\]\)/,
    /Route::post\('database-backups\/\{file\}\/restore', \[AdminMaintenanceController::class, 'restoreBackup'\]\)/,
    /Route::post\('database-backups\/upload', \[AdminMaintenanceController::class, 'uploadBackup'\]\)/,
    /Route::delete\('database-backups\/\{file\}', \[AdminMaintenanceController::class, 'deleteBackup'\]\)/,
    /Route::put\('storage', \[AdminMaintenanceController::class, 'updateStorage'\]\)/,
    /Route::post\('storage\/relocate', \[AdminMaintenanceController::class, 'relocateStorage'\]\)/,
    /Route::post\('automation', \[AdminMaintenanceController::class, 'runAutomation'\]\)/,
  ]) assert.match(routes, route);

  // فایل‌های پشتیبان فقط با نام پایه قابل دسترسی‌اند (بدون پیمایش مسیر)
  assert.match(controller, /basename\(trim\(\$file\)\)/);
  assert.match(controller, /str_ends_with\(\$name, '\.sql\.gz'\)/);
  // بازگردانی فقط با تأیید نام دقیق فایل و بدون محدودیت زمانی اجرا می‌شود
  assert.match(controller, /trim\(\$validated\['confirm'\]\) !== basename\(trim\(\$file\)\)/);
  assert.match(controller, /@set_time_limit\(0\)/);
  // پشتیبان‌گیری با PHP انجام می‌شود؛ هیچ فراخوانی ابزار بیرونی در پنل نیست
  assert.doesNotMatch(controller, /mysqldump/);
  assert.doesNotMatch(controller, /shell_exec|exec\(/);

  // محل ذخیرهٔ فایل‌ها از تنظیمات سامانه خوانده و روی دیسک local نشانده می‌شود
  assert.match(settings, /public const KEY = 'storage'/);
  assert.match(settings, /config\(\['filesystems\.disks\.local\.root' => \$path\]\)/);
  assert.match(settings, /public static function usable/);
  assert.match(provider, /StorageSettings::apply\(\)/);

  // اجرای دستی به‌روزرسانی خودکار برای هاست‌های بدون cron
  assert.match(controller, /public function runAutomation/);
  assert.match(controller, /\$sweep->refreshDue\(\$limit\)/);
  assert.match(controller, /\$overdue->run\(\)/);
  assert.match(controller, /PollingRunner::class\)->tick\(true\)/);
});

test('محل ذخیرهٔ فایل‌ها و پشتیبان در بخش تنظیمات سامانه است', async () => {
  const [view, panel, api] = await Promise.all([
    source('../src/components/settings/SettingsView.tsx'),
    source('../src/components/settings/StorageBackupPanel.tsx'),
    source('../src/api/maintenance.ts'),
  ]);

  assert.match(view, /import \{ StorageBackupPanel \} from '\.\/StorageBackupPanel'/);
  assert.match(view, /\| 'storage';/);
  assert.match(view, /\{ id: 'storage', label: 'فایل‌ها و پشتیبان'/);
  assert.match(view, /\{activeTab === 'storage' && \(/);
  assert.match(view, /hasPermission\('settings\.manage'\)/);
  // تب‌هایی که خودشان ذخیره/اجرای فوری دارند دکمهٔ ذخیرهٔ سراسری نمی‌خواهند
  assert.match(view, /\{!\['activity', 'bale', 'storage'\]\.includes\(activeTab\)/);

  // پنل فقط از دادهٔ سرور استفاده می‌کند و عدد ساختگی ندارد
  assert.match(panel, /maintenanceApi\.overview\(signal\)/);
  assert.match(panel, /maintenanceApi\.createBackup/);
  assert.match(panel, /maintenanceApi\.uploadBackup/);
  assert.match(panel, /maintenanceApi\.deleteBackup/);
  assert.match(panel, /maintenanceApi\.updateStorage/);
  assert.match(panel, /maintenanceApi\.relocateStorage/);
  assert.match(panel, /maintenanceApi\.runAutomation/);
  // بازگردانی فقط با نوشتن دقیق نام فایل فعال می‌شود
  assert.match(panel, /restoreConfirm\.trim\(\) !== item\.file/);
  assert.match(panel, /maintenanceApi\.restoreBackup\(item\.file, restoreConfirm\.trim\(\)\)/);
  assert.match(panel, /formatBytesFa/);
  assert.match(panel, /database\.table_names/);

  // دانلود فایل پشتیبان از مرورگر با نشست کاربر
  assert.match(api, /credentials: 'include'/);
  assert.match(api, /maintenance\/database-backups\/\$\{encodeURIComponent\(file\)\}\/download/);
  assert.match(api, /runtime\.apiUrl/);
});

test('یادآوری مسئول اجرا: اعلان سامانه و پیام بله از یک دکمه', async () => {
  const [routes, controller, service, dashboard, tasksApi] = await Promise.all([
    source('../../backend/routes/api.php'),
    source('../../backend/app/Http/Controllers/Api/V1/TaskReminderController.php'),
    source('../../backend/app/Services/TaskReminders.php'),
    source('../src/components/departments/DepartmentDashboardView.tsx'),
    source('../src/api/tasks.ts'),
  ]);

  assert.match(routes, /Route::post\('tasks\/\{task\}\/reminder', TaskReminderController::class\)/);
  assert.match(routes, /'permission:tasks\.view', 'permission:tasks\.edit'/);
  assert.match(controller, /TaskReminders \$reminders/);

  // اعلان از همان مسیر اعلان‌های سامانه ساخته می‌شود تا ارسال بله خودکار انجام شود
  assert.match(service, /DomainRecord::DOMAIN_NOTIFICATION/);
  assert.match(service, /'linkTaskId' => \(string\) \$task->id/);
  assert.match(service, /'notificationCategory' => 'tasks'/);
  assert.match(service, /Schema::hasColumn\('domain_records', 'notification_key'\)/);
  assert.match(service, /public const COOLDOWN_MINUTES = 60/);
  // کاربر غیرفعال یا وظیفهٔ بدون مسئول، صریح و فارسی پاسخ می‌گیرد
  assert.match(service, /isActive\(\)/);
  assert.match(service, /برای این وظیفه مسئول اجرا تعیین نشده است/);

  // دکمهٔ یادآوری در بخش وظیفه‌های داشبورد دپارتمان
  assert.match(dashboard, /tasksApi\.remind\(task\.id\)/);
  assert.match(dashboard, /مسئول اجرا: \{person\(task\.assigneeId\)\}/);
  assert.match(dashboard, /<BellRing/);
  assert.match(dashboard, /یادآوری/);
  assert.match(tasksApi, /remind\(id: string\)/);
  assert.match(tasksApi, /`\/tasks\/\$\{id\}\/reminder`/);
});

test('فید فعالیت‌ها کد ماشینی نشان نمی‌دهد و برچسب فارسی یک منبع دارد', async () => {
  const [labels, view, resource, baleSettings, library, tables, history, drawer] = await Promise.all([
    source('../src/utils/activityLabels.ts'),
    source('../src/components/activity/ActivityView.tsx'),
    source('../../backend/app/Http/Resources/ActivityLogResource.php'),
    source('../../backend/app/Bot/Bale/Settings.php'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/dam/DamDataTables.tsx'),
    source('../src/components/dam/DamActivityHistory.tsx'),
    source('../src/components/dam/AssetDetailsDrawer.tsx'),
  ]);

  // یک منبع واحد ترجمه برای همهٔ نمایش‌دهنده‌ها
  assert.match(labels, /export function activityLabel/);
  assert.match(labels, /export function activityDetails/);
  assert.match(labels, /const PERSIAN = \/\[\\u0600-\\u06FF\]\//);
  assert.match(labels, /return hasPersian\(value\) \? value : fallback;/);
  assert.match(labels, /duplicate_reused:/);
  assert.match(labels, /bale_settings_changed:/);
  assert.doesNotMatch(view, /ACTIVITY_LABELS\[/);
  assert.doesNotMatch(library, /ACTIVITY_LABELS\[/);
  assert.match(view, /activityLabel\(act\.action, badge\.label\)/);
  assert.match(drawer, /activityLabel\(act\.action\)/);
  assert.match(history, /activityLabel\(activity\.action\)/);
  assert.match(tables, /activityLabel\(act\.action, 'رویداد ردیف', ROW_ACTIVITY_LABELS\)/);

  // سرور هم کد را به متن فارسی تبدیل می‌کند
  assert.match(resource, /ActivityLabels::action\(\$this->action, \$this->type\)/);
  assert.match(baleSettings, /'action' => ActivityLabels::action\(\$type, \$type\)/);
});

test('بخش اعلان‌ها پویا شد: دسته‌بندی رسمی، شمار واقعی و دو کلید با اثر واقعی', async () => {
  const [view, controller, routes, overdue, comments, policy] = await Promise.all([
    source('../src/components/settings/SettingsView.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/NotificationInboxController.php'),
    source('../../backend/routes/api.php'),
    source('../../backend/app/Services/OverdueNotifications.php'),
    source('../../backend/app/Services/CommentNotifications.php'),
    source('../../backend/app/Support/Notifications/NotificationPolicy.php'),
  ]);

  assert.match(routes, /Route::get\('notifications\/overview', \[NotificationInboxController::class, 'overview'\]\)/);
  assert.match(controller, /public function overview\(Request \$request, NotificationInbox \$inbox, NotificationCatalog \$catalog\)/);
  assert.match(controller, /'categories' => \$categories/);
  assert.match(controller, /'bale' => \[/);
  assert.match(controller, /'policy' => \[/);

  assert.match(view, /notificationsApi\.overview\(\)/);
  assert.match(view, /notificationsData\?\.categories\.map/);
  assert.match(view, /دسته‌بندی اعلان‌ها و شمار واقعی کارتابل شما/);
  assert.match(view, /مشاهدهٔ کارتابل اعلان‌ها/);

  // کلیدهای سیاست واقعاً روی سرویس‌های ارسال اثر دارند
  assert.match(policy, /public static function enabled\(string \$flag\)/);
  assert.match(policy, /OrganizationSettings::DEFAULTS\[self::KEY\]/);
  assert.match(overdue, /NotificationPolicy::enabled\('deadlineReminders'\)/);
  assert.match(comments, /NotificationPolicy::enabled\('mentionAlerts'\)/);
  // اشاره‌ها با نام واقعی کاربران تطبیق داده می‌شوند (بدون داده ساختگی)
  assert.match(comments, /private function mentioned\(Comment \$comment, User \$actor\): array/);
  assert.match(comments, /mb_stripos\(\$body, '@'\.\$name\)/);
  assert.match(comments, /'mention:'/);
});

test('فیلد توکن بله و کلید فعال‌سازی هم‌ترازند', async () => {
  const panel = await source('../src/components/bale/BaleSettingsPanel.tsx');

  // هر دو کنترل یک برچسب بالای خود و یک ارتفاع کنترل مشترک دارند
  assert.match(panel, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,15rem\)\] lg:items-start/);
  assert.match(panel, /وضعیت ربات/);
  assert.match(panel, /min-h-\[var\(--control-height\)\] items-center gap-3 rounded-xl border px-4 text-xs font-bold/);
  assert.match(panel, /ذخیره و فعال‌سازی خودکار/);
  // راهنمای امنیت توکن دیگر هم‌ردیف با کنترل‌ها نیست تا ارتفاع را جابه‌جا نکند
  assert.doesNotMatch(panel, /lg:items-end/);
});

test('پارامترهای پشتیبان‌گیری پنل همان قواعد سرور را رعایت می‌کنند', async () => {
  const controller = await source('../../backend/app/Http/Controllers/Api/V1/AdminMaintenanceController.php');

  // سقف بارگذاری از تنظیمات واقعی PHP می‌آید، نه یک عدد ثابت
  assert.match(controller, /\$this->iniBytes\('upload_max_filesize'\)/);
  assert.match(controller, /\$this->iniBytes\('post_max_size'\)/);
  // تعداد نسخه‌های نگه‌داشته‌شده از پیکربندی خوانده می‌شود
  assert.match(controller, /config\('tadbir\.backup_keep', 7\)/);
  assert.match(controller, /\$this->backups->prune\(\$keep\)/);
  // محل پیشنهادی همیشه بیرون از پوشهٔ نرم‌افزار است
  assert.match(controller, /dirname\(\$base\)/);
});

test('گزارش جدول‌های پایگاه‌داده در پنل نگهداری دیده می‌شود', async () => {
  const [controller, api, panel] = await Promise.all([
    source('../../backend/app/Http/Controllers/Api/V1/AdminMaintenanceController.php'),
    source('../src/api/maintenance.ts'),
    source('../src/components/settings/StorageBackupPanel.tsx'),
  ]);

  assert.match(controller, /'table_names' => array_values\(array_map\('strval', \(array\) \(\$inspect\['tables'\] \?\? \[\]\)\)\)/);
  assert.match(api, /table_names\?: string\[\]/);
  assert.match(panel, /فهرست جدول‌های پایگاه‌داده/);
});

test('نمایش حجم فایل یک تعریف مشترک فارسی دارد', async () => {
  const [bytes, library, tasks, panel] = await Promise.all([
    source('../src/utils/bytes.ts'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/tasks/TaskAssetsSection.tsx'),
    source('../src/components/settings/StorageBackupPanel.tsx'),
  ]);

  assert.match(bytes, /export function formatBytesFa\(/);
  assert.match(bytes, /'بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'/);
  // نسخه‌های تکراری محلی حذف و به همان تعریف وصل شده‌اند
  assert.match(library, /const formatSize = \(bytes = 0\) => formatBytesFa\(bytes\)/);
  assert.match(tasks, /const formatSize = \(bytes = 0\) => formatBytesFa\(bytes, '—'\)/);
  assert.doesNotMatch(library, /const units = \['بایت', 'کیلوبایت'/);
  assert.doesNotMatch(tasks, /const units = \['بایت', 'کیلوبایت'/);
  assert.match(panel, /formatBytesFa\(storage\.free_bytes/);
});
