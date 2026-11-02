import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const backend = path => readFileSync(new URL(`../../backend/${path}`, import.meta.url), 'utf8');
const repo = path => new URL(`../../${path}`, import.meta.url);

/**
 * دور ۶۵: بهینه‌سازی مسیرهای پرتردد — ایندکس گزارش‌ها، حذف N+1 «دنبال‌کردن» و
 * اجرای محدود کارهای خودکار در مسیر خواندن (بدون cron و worker).
 */
test('کارهای خودکار مسیر خواندن حداکثر یک بار در دقیقه اجرا می‌شوند', () => {
  const throttle = backend('app/Support/AutomationThrottle.php');
  assert.match(throttle, /public static function once\(string \$key, int \$seconds, callable \$work\): mixed/);
  assert.match(throttle, /Cache::add\(\$cacheKey, 1, max\(1, \$seconds\)\)/);

  const content = backend('app/Http/Controllers/Api/V1/ContentController.php');
  assert.match(content, /AutomationThrottle::once\('series-occurrences', 60,/);
  assert.match(content, /AutomationThrottle::once\('content-deadline-sweep', 60,/);

  const analytics = backend('app/Http/Controllers/Api/V1/AnalyticsController.php');
  assert.match(analytics, /AutomationThrottle::once\('content-deadline-sweep', 60,/);

  const dashboard = backend('app/Http/Controllers/Api/V1/DepartmentDashboardController.php');
  assert.match(dashboard, /AutomationThrottle::once\('content-deadline-sweep', 60,/);

  const inbox = backend('app/Http/Controllers/Api/V1/NotificationInboxController.php');
  assert.match(inbox, /AutomationThrottle::once\('publication-reminders', 60,/);
});

test('وضعیت «دنبال‌کردن» در فهرست محتوا با همان کوئری خوانده می‌شود', () => {
  const content = backend('app/Http/Controllers/Api/V1/ContentController.php');
  assert.match(content, /->withExists\(\[\s*'watchers as is_watched' => fn \(\$watcher\) => \$watcher->where\('users\.id', \$viewerId\),/);

  const resource = backend('app/Http/Resources/ContentResource.php');
  // مقدار آمادهٔ فهرست مقدم است؛ فقط در جزئیات همان کوئری قبلی اجرا می‌شود.
  assert.match(resource, /'isWatched' => \$request->user\(\)\s*\? \(bool\) \(\$this->resource->is_watched\s*\?\? \$this->watchers\(\)->where\('users\.id', \$request->user\(\)->id\)->exists\(\)\)/);
});

test('ایندکس‌های گزارش و فهرست ساخته می‌شوند و قابل بازگشت‌اند', () => {
  const path = 'backend/database/migrations/2026_11_02_000001_add_workspace_reporting_indexes.php';
  assert.ok(existsSync(repo(path)), 'migration ایندکس‌ها باید وجود داشته باشد');
  const migration = backend('database/migrations/2026_11_02_000001_add_workspace_reporting_indexes.php');

  for (const index of [
    'contents_status_deadline_index', 'contents_type_status_index', 'contents_deadline_index',
    'tasks_status_deadline_index', 'tasks_assignee_status_index', 'tasks_project_status_index', 'tasks_deadline_index',
    'workspace_records_kind_status_index',
  ]) {
    assert.match(migration, new RegExp(index), `${index} باید ساخته شود`);
    assert.match(migration, new RegExp(`dropIndex\\('${index}'\\)`), `${index} باید در down حذف شود`);
  }
});

test('نقشهٔ بهبود پلتفرم مستند شده است', () => {
  assert.ok(existsSync(repo('docs/platform-roadmap-1405.md')), 'سند نقشهٔ بهبود باید وجود داشته باشد');
  const doc = readFileSync(repo('docs/platform-roadmap-1405.md'), 'utf8');
  assert.match(doc, /ستون‌های تولیدشده برای مسیرهای JSON/);
  assert.match(doc, /شکستن `AppContext`/);
  assert.match(doc, /«امروز من»/);
});
