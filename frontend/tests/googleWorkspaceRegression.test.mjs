import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = path => readFile(resolve(here, path), 'utf8');

test('Google Workspace keeps native DAM records canonical and exposes explicit manual actions', async () => {
  const [panel, library, tables, settings] = await Promise.all([
    source('../src/components/common/GoogleWorkspacePanel.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/dam/DamDataTables.tsx'),
    source('../src/components/settings/SettingsView.tsx'),
  ]);

  assert.match(panel, /نسخه بومی تدبیر مرجع اصلی است/);
  assert.match(panel, /بازکردن در Google/);
  assert.match(panel, /ارسال نسخه به گوگل/);
  assert.match(panel, /دریافت آخرین تغییرات/);
  assert.match(panel, /قطع اتصال/);
  assert.match(panel, /error\.status === 409/);
  assert.match(library, /resource="asset"/);
  assert.match(tables, /resource="table"/);
  assert.match(settings, /Google Drive/);
  assert.match(settings, /Google Docs/);
  assert.match(settings, /Google Sheets/);
  assert.match(settings, /Google Calendar و Meet/);
  assert.match(settings, /همگام‌سازی خودکار فعال نیست/);
  assert.doesNotMatch(settings, /backend\/\.env/);
});

test('Google Workspace backend uses server-only credentials, safe links and auditable versions', async () => {
  const [client, service, link, controller, routes, migration] = await Promise.all([
    source('../../backend/app/Services/GoogleWorkspaceClient.php'),
    source('../../backend/app/Services/GoogleWorkspaceService.php'),
    source('../../backend/app/Models/GoogleWorkspaceLink.php'),
    source('../../backend/app/Http/Controllers/Api/V1/GoogleWorkspaceController.php'),
    source('../../backend/routes/api.php'),
    source('../../backend/database/migrations/2026_10_09_000001_add_google_workspace_links.php'),
  ]);

  assert.match(client, /GoogleWorkspaceClient::class|class GoogleWorkspaceClient/);
  assert.match(client, /credentials_path/);
  assert.match(client, /withToken\(\$token\)/);
  assert.match(link, /protected \$hidden = \[[\s\S]*?'google_file_id'[\s\S]*?'local_fingerprint'[\s\S]*?'metadata'/);
  assert.match(link, /function safePayload/);
  assert.doesNotMatch(link.match(/function safePayload[\s\S]*?\n    }/)?.[0] || '', /'(?:google_file_id|remote_version|local_fingerprint|metadata)'\s*=>/);
  assert.match(service, /remoteChanged/);
  assert.match(service, /assetFingerprint/);
  assert.match(service, /tableFingerprint/);
  assert.match(service, /دریافت تغییرات از Google Docs/);
  assert.match(service, /createTableVersion/);
  assert.match(controller, /DamAssetAccess/);
  assert.match(controller, /DamTableAccess/);
  assert.match(routes, /google-workspace\/push/);
  assert.match(routes, /google-workspace\/pull/);
  assert.match(migration, /dam_data_table_versions/);
  assert.match(migration, /google_workspace_links/);
});

test('Google Workspace features stay hidden until the server connection is actually configured', async () => {
  const [availability, library, tables, meeting, settings] = await Promise.all([
    source('../src/utils/googleWorkspace.ts'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/dam/DamDataTables.tsx'),
    source('../src/components/thought-room/CreateMeetingModal.tsx'),
    source('../src/components/settings/SettingsView.tsx'),
  ]);

  // یک منبع حقیقت: آمادگی از پیکربندی سرور می‌آید، نه از فرض مرورگر
  assert.match(availability, /if \(settings\.serverConfigured !== true\) return false;/);
  assert.match(availability, /return settings\.enabled === true;/);
  assert.match(availability, /return service === 'docs' \? settings\.docsEnabled === true : settings\.sheetsEnabled === true;/);
  assert.match(availability, /hasExistingLink \|\| googleServiceEnabled\(settings, service\)/);

  // پنل‌های مخزن فقط با اتصال واقعی (یا پیوند موجود) دیده می‌شوند
  assert.match(library, /showGoogleWorkspacePanel\(googleMeetSettings, 'docs', Boolean\(asset\.google_workspace_link\)\)/);
  assert.match(library, /available=\{googleServiceEnabled\(googleMeetSettings, 'docs'\)\}/);
  assert.match(tables, /showGoogleWorkspacePanel\(googleMeetSettings, 'sheets',/);
  assert.match(tables, /available=\{googleServiceEnabled\(googleMeetSettings, 'sheets'\)\}/);

  // دکمهٔ Google Meet بدون اتصال سرور ساخته نمی‌شود
  assert.match(meeting, /googleServiceEnabled\(googleMeetSettings, 'meet'\)/);
  assert.match(meeting, /فعال‌سازی در تنظیمات/);
  assert.doesNotMatch(meeting, /googleMeetSettings\.enabled && googleMeetSettings\.serverConfigured !== false/);

  // کلیدهای فعال‌سازی و ذخیره هم فقط با اتصال واقعی نمایش داده می‌شوند
  assert.match(settings, /\{googleMeetSettings\.serverConfigured === true \? \(/);
  assert.match(settings, /\{googleMeetSettings\.serverConfigured === true && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">/);
  assert.match(settings, /ویژگی‌های Google Workspace روی این سرور پیکربندی نشده است/);
  assert.match(settings, /docs\/google-workspace\.md/);
});
