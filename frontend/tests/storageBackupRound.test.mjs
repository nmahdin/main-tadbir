import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('ریشهٔ فایل‌ها با TADBIR_FILES_ROOT بیرون از نرم‌افزار قابل انتقال است', async () => {
  const [filesystems, tadbir, env] = await Promise.all([
    source('../../backend/config/filesystems.php'),
    source('../../backend/config/tadbir.php'),
    source('../../backend/.env.example'),
  ]);

  // دیسک local همان جایی است که DAM و پیوست‌ها از آن می‌خوانند
  assert.match(filesystems, /'root' => env\('TADBIR_FILES_ROOT'\) \?: storage_path\('app\/private'\)/);
  // پیش‌فرض عوض نشده تا نصب موجود بی‌وقفه بماند
  assert.match(filesystems, /'local' => \[/);
  assert.match(tadbir, /'files_root' => env\('TADBIR_FILES_ROOT'\)/);
  assert.match(tadbir, /'files_legacy_root' => env\('TADBIR_FILES_LEGACY_ROOT'\)/);
  assert.match(tadbir, /'backup_root' => env\('TADBIR_BACKUP_ROOT'\)/);
  assert.match(tadbir, /'backup_keep' => max\(1, \(int\) env\('TADBIR_BACKUP_KEEP', 7\)\)/);
  assert.match(tadbir, /'maintenance_secret' => env\('TADBIR_MAINTENANCE_SECRET'\)/);
  assert.match(env, /TADBIR_FILES_ROOT=/);
  assert.match(env, /TADBIR_BACKUP_ROOT=/);
  assert.match(env, /TADBIR_BACKUP_KEEP=7/);
  assert.match(env, /TADBIR_MAINTENANCE_SECRET=/);
});

test('یک منبع حقیقت برای مسیرها و سهمیه وجود دارد', async () => {
  const [paths, dam, quota] = await Promise.all([
    source('../../backend/app/Support/Storage/StoragePaths.php'),
    source('../../backend/config/dam.php'),
    source('../../backend/config/dam.quota.php.example').catch(() => ''),
  ]);

  assert.match(paths, /public static function filesRoot\(\)/);
  assert.match(paths, /public static function backupRoot\(\)/);
  assert.match(paths, /public static function isInsideApplication/);
  assert.match(paths, /public static function filePath/);
  assert.match(paths, /public static function localDisks/);
  // ریشهٔ فایل‌ها از همان کلید دیسک خوانده می‌شود، نه یک کلید دوم
  assert.match(paths, /config\('filesystems\.disks\.local\.root'/);
  // سهمیه با فایل هم قابل تنظیم است ولی closure ندارد تا config:cache کار کند
  assert.match(dam, /dam\.quota\.php/);
  assert.doesNotMatch(dam, /function \(\): int \{/);
  assert.equal(quota, '');
});

test('پشتیبان دیتابیس بدون وابستگی بیرونی ساخته و قابل بازگردانی است', async () => {
  const [backup, backupCommand, restoreCommand, operations] = await Promise.all([
    source('../../backend/app/Support/Storage/DatabaseBackup.php'),
    source('../../backend/app/Console/Commands/BackupDatabase.php'),
    source('../../backend/app/Console/Commands/RestoreDatabase.php'),
    source('../../docs/storage-and-backup.md'),
  ]);

  // دامپ با PDO خود برنامه، بدون mysqldump
  assert.match(backup, /SHOW CREATE TABLE/);
  assert.match(backup, /sqlite_master/);
  assert.match(backup, /SET FOREIGN_KEY_CHECKS=0/);
  assert.match(backup, /PRAGMA foreign_keys=OFF/);
  // بایت‌های غیرمتنی به‌صورت X'..' نوشته می‌شوند تا متن فارسی خراب نشود
  assert.match(backup, /"X'"\.bin2hex\(\$string\)\."'"/);
  // manifest + هش + نگه‌داشت نسخه‌ها
  assert.match(backup, /'sha256' => \$sha256/);
  assert.match(backup, /'migrations' => \$this->lastMigrations\(\)/);
  assert.match(backup, /public function prune\(int \$keep\)/);
  // بازگردانی بدون تأیید صریح و بدون پشتیبان ایمنی انجام نمی‌شود
  assert.match(backup, /بازگردانی نیازمند تأیید صریح است/);
  assert.match(backup, /'label' => 'pre-restore'/);
  assert.match(backup, /هش فایل پشتیبان با manifest یکسان نیست/);

  assert.match(backupCommand, /protected \$signature = 'tadbir:backup/);
  assert.match(backupCommand, /--with-files/);
  assert.match(backupCommand, /--list/);
  assert.match(restoreCommand, /--confirm=/);
  assert.match(restoreCommand, /protected \$signature = 'tadbir:restore/);

  assert.match(operations, /php artisan tadbir:backup --label=before-update/);
  assert.match(operations, /php artisan tadbir:restore /);
  assert.match(operations, /APP_KEY/);
});

test('انتقال فایل‌ها پیش‌فرض خشک‌اجرا و تکرارپذیر است', async () => {
  const [relocator, command] = await Promise.all([
    source('../../backend/app/Support/Storage/StorageRelocator.php'),
    source('../../backend/app/Console/Commands/RelocateFiles.php'),
  ]);

  assert.match(relocator, /public function run\(int \$limit = 200, bool \$apply = false/);
  assert.match(relocator, /public function status\(\): array/);
  assert.match(relocator, /'mode' => \$canRename \? 'move' : 'copy'/);
  assert.match(relocator, /'pending' => \$pending/);
  assert.match(command, /protected \$signature = 'tadbir:files-relocate/);
  assert.match(command, /--apply/);
  assert.match(command, /--prune-source/);
});

test('نقطهٔ تعمیر بدون SSH در نبود کلید وجود ندارد', async () => {
  const [controller, routes] = await Promise.all([
    source('../../backend/app/Http/Controllers/Api/V1/MaintenanceController.php'),
    source('../../backend/routes/api.php'),
  ]);

  // کلید کوتاه یا خالی ⇒ ۴۰۴ (نه ۴۰۳)، تا وجود مسیر هم افشا نشود
  assert.match(controller, /abort_unless\(strlen\(\$secret\) >= 32, 404\)/);
  assert.match(controller, /hash_equals\(\$secret, \$given\)/);
  // بازگردانی دیتابیس عمداً فقط در CLI است
  assert.doesNotMatch(controller, /restore/i);
  assert.match(routes, /Route::prefix\('maintenance'\)->middleware\('throttle:20,1,maintenance'\)/);
  assert.match(routes, /Route::post\('backup', \[MaintenanceController::class, 'backup'\]\)/);
  assert.match(routes, /Route::post\('files-relocate', \[MaintenanceController::class, 'relocate'\]\)/);
  assert.match(routes, /Route::post\('refresh-status', \[MaintenanceController::class, 'refreshStatus'\]\)/);
});

test('وضعیت مشتق در داشبورد و گزارش‌ها هم تازه می‌شود', async () => {
  const [analytics, dashboard, sweep, console] = await Promise.all([
    source('../../backend/app/Http/Controllers/Api/V1/AnalyticsController.php'),
    source('../../backend/app/Http/Controllers/Api/V1/DepartmentDashboardController.php'),
    source('../../backend/app/Services/ContentDeadlineSweep.php'),
    source('../../backend/routes/console.php'),
  ]);

  assert.match(analytics, /app\(ContentDeadlineSweep::class\)->refreshDue\(50\)/);
  assert.match(dashboard, /app\(ContentDeadlineSweep::class\)->refreshDue\(50\)/);
  assert.match(sweep, /public function countDue\(/);
  assert.match(sweep, /public function countUnsynced\(/);
  assert.match(console, /Schedule::command\('tadbir:backup'\)/);
});

test('مسیر نمایش‌داده‌شده به مدیر همان دیسک واقعی فایل است', async () => {
  const [controller, library] = await Promise.all([
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
    source('../src/components/dam/DamLibrary.tsx'),
  ]);

  // پیش‌تر ریشهٔ دیسک عمومی نمایش داده می‌شد که جای واقعی فایل نبود
  assert.doesNotMatch(controller, /filesystems\.disks\.public\.root/);
  assert.match(controller, /config\("filesystems\.disks\.\{\$disk\}\.root", ''\)/);
  assert.match(controller, /\['storage_absolute_path'\] =/);
  assert.match(controller, /\['storage_outside_application'\] =/);
  assert.match(library, /storage_absolute_path/);
  assert.match(library, /بیرون از پوشهٔ نرم‌افزار؛ با آپدیت پاک نمی‌شود/);
});
