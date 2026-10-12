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
