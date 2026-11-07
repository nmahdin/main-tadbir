import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const repo = path => new URL(`../../${path}`, import.meta.url);
const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const backend = path => readFileSync(repo(`backend/${path}`), 'utf8');

const indexes = backend('app/Support/Schema/WorkspaceIndexes.php');
const migration = backend('database/migrations/2026_11_02_000001_add_workspace_reporting_indexes.php');
const controller = backend('app/Http/Controllers/Api/V1/AdminMaintenanceController.php');
const routes = backend('routes/api.php');
const panel = source('components/settings/StorageBackupPanel.tsx');
const maintenanceApi = source('api/maintenance.ts');
const context = source('context/AppContext.tsx');

/**
 * دور ۶۶: ساخت ایندکس‌های عملکرد بدون SSH (پنل نگهداری + فایل SQL + مایگریشن
 * idempotent) و حذف دانلود تکراری ۲۰۰ اعلان.
 */
test('ایندکس‌های عملکرد یک منبع حقیقت دارند و مایگریشن فقط همان را صدا می‌زند', () => {
  assert.match(indexes, /public const DEFINITIONS = \[/);
  for (const name of [
    'contents_status_deadline_index', 'contents_type_status_index', 'contents_deadline_index',
    'tasks_status_deadline_index', 'tasks_assignee_status_index', 'tasks_project_status_index', 'tasks_deadline_index',
    'workspace_records_kind_status_index',
  ]) {
    assert.match(indexes, new RegExp(`'${name}' =>`), `${name} باید در DEFINITIONS باشد`);
  }

  // مایگریشن هیچ جدولی نمی‌سازد؛ فقط ensure/drop همان کلاس را صدا می‌زند.
  assert.doesNotMatch(migration, /Schema::create/);
  assert.match(migration, /\(new WorkspaceIndexes\(\)\)->ensure\(\)/);
  assert.match(migration, /\(new WorkspaceIndexes\(\)\)->drop\(\)/);
  assert.match(migration, /اختیاری است/);
});

test('پنل نگهداری وضعیت ایندکس‌ها را نشان می‌دهد و ناقص‌ها را می‌سازد', () => {
  assert.match(controller, /'indexes' => \(new WorkspaceIndexes\(\)\)->status\(\)/);
  assert.match(controller, /public function applyIndexes\(\): JsonResponse/);
  assert.match(controller, /\$result = \$indexes->ensure\(\);/);
  // مسیر با مجوز مدیریت تنظیمات و throttle، هم‌خانوادهٔ بقیهٔ عملیات نگهداری.
  assert.match(routes, /Route::post\('indexes', \[AdminMaintenanceController::class, 'applyIndexes'\]\)->middleware\('throttle:6,1,admin-maintenance-write'\)/);

  assert.match(maintenanceApi, /export interface MaintenanceIndexStatus/);
  assert.match(maintenanceApi, /applyIndexes\(\) \{/);
  assert.match(maintenanceApi, /'\/maintenance\/indexes'/);

  assert.match(panel, /ایندکس‌های عملکرد پایگاه‌داده/);
  assert.match(panel, /const indexStatus = data\.indexes;/);
  assert.match(panel, /indexStatus\.present\.toLocaleString\('fa-IR'\)/);
  assert.match(panel, /maintenanceApi\.applyIndexes\(\)/);
  assert.match(panel, /ساخت ایندکس‌های ناقص/);
  assert.match(panel, /workspace-indexes\.mysql\.sql/);
});

test('فایل SQL دستی برای هاست بدون CLI وجود دارد و همهٔ هشت ایندکس را می‌سازد', () => {
  const path = 'docs/deployment/workspace-indexes.mysql.sql';
  assert.ok(existsSync(repo(path)), 'فایل SQL باید وجود داشته باشد');
  const sql = readFileSync(repo(path), 'utf8');

  for (const name of [
    'contents_status_deadline_index', 'contents_type_status_index', 'contents_deadline_index',
    'tasks_status_deadline_index', 'tasks_assignee_status_index', 'tasks_project_status_index', 'tasks_deadline_index',
    'workspace_records_kind_status_index',
  ]) {
    assert.match(sql, new RegExp('ADD INDEX `' + name + '`'), `${name} در SQL باید ساخته شود`);
  }
  // اجرای دوباره بی‌خطر است: وجود ایندکس از information_schema بررسی می‌شود.
  assert.match(sql, /information_schema\.statistics/);
  assert.match(sql, /ADD INDEX/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('اعلان‌ها بعد از تغییر جلسه دوباره با ۲۰۰ ردیف دانلود نمی‌شوند', () => {
  assert.doesNotMatch(context, /notificationsApi\.list\(\)\.then\(r => setNotifications\(r\.data\)\)/);
  assert.match(context, /void invalidateWorkspaceModules\(currentUser\.id, \['notifications'\]\);/);
});
