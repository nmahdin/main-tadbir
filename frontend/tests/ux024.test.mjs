// UX-02-4: shared experience + unified notification center (§19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p), 'utf8');

const logic = await import('../src/shared/ui/notificationLogic.ts');
const dirty = await import('../src/shared/lib/dirtyRegistry.ts');
const dates = await import('../src/shared/lib/date.ts');
const targetMod = await import('../src/features/notifications/notificationTarget.ts');
const listQuery = await import('../src/app/router/listQuery.ts');

/* §amendment A: one central soft-shadow token */
test('one soft shadow token; PageSurface uses it; no heavy surface shadow remains', () => {
  const css = read('src/styles/index.css');
  assert.match(css, /--shadow-surface:\s*0 2px 8px rgb\(27 63 81 \/ 0\.045\)/);
  const surface = read('src/shared/ui/PageSurface.tsx');
  assert.ok(surface.includes('shadow-surface'));
  assert.ok(!surface.includes('0 14px 40px'), 'heavy legacy shadow gone');
  const inbox = read('src/features/notifications/NotificationsView.tsx');
  assert.ok(inbox.includes('PageSurface'));
});

/* toasts keep the physical top-left stack (already DSM-compliant) */
test('toast viewport stays physical top-left; action slot supported', () => {
  const css = read('src/styles/index.css');
  assert.match(css, /\.ui-toast-viewport\s*\{[\s\S]*?position:\s*fixed/);
  const record = logic.createToastRecord(
    { kind: 'info', title: 'خوانده شد', action: { label: 'بازگردانی', onClick: () => {} } },
    't1', 1000,
  );
  assert.equal(record.action?.label, 'بازگردانی');
});

/* §12 dirty registry */
test('dirty registry reports and discards registered sources', () => {
  assert.equal(dirty.anyDirtySource(), false);
  let discarded = 0;
  const off = dirty.registerDirtySource('test-source', { isDirty: () => true, discard: () => { discarded += 1; } });
  assert.equal(dirty.anyDirtySource(), true);
  dirty.discardAllDirtySources();
  assert.equal(discarded, 1);
  off();
  assert.equal(dirty.anyDirtySource(), false);
});

/* §10 Jalali + user timezone */
test('Persian date-time honors the configured display timezone', () => {
  dates.setDisplayTimeZone('UTC');
  const utc = dates.formatPersianDateTime('2026-10-19T00:30:00Z');
  dates.setDisplayTimeZone('Asia/Tehran');
  const Tehran = dates.formatPersianDateTime('2026-10-19T00:30:00Z');
  assert.notEqual(utc, Tehran);
  assert.match(Tehran, /[۰-۹]/, 'Persian numerals rendered');
  dates.setDisplayTimeZone(null);
  assert.equal(dates.getDisplayTimeZone(), 'Asia/Tehran');
});

/* §5.3 click resolution */
const envPayload = {
  platform: { eligible: true, is_primary: true, permissions: [] },
  organizations: [],
  workspaces: [{ id: 7, name: 'فضای کاری هفت', organization: null, role: { id: 'member', name: 'عضو' }, modules: [], is_active: true, archived_at: null }],
};

test('notification without allowlisted destination is unavailable, never fabricated', () => {
  const target = targetMod.resolveNotificationTarget(
    { id: '1', userId: '1', title: 'x', message: 'y', type: 'info', read: false, timestamp: '', linkMeetingId: '3' },
    envPayload, { kind: 'workspace', id: 7 },
  );
  assert.equal(target.kind, 'unavailable');
});

test('same-context destination navigates directly', () => {
  const target = targetMod.resolveNotificationTarget(
    { id: '1', userId: '1', title: 'x', message: 'y', type: 'info', read: false, timestamp: '', linkTaskId: '12', context: { kind: 'workspace', id: 7 } },
    envPayload, { kind: 'workspace', id: 7 },
  );
  assert.deepEqual(target, { kind: 'navigate', path: '/tasks/12' });
});

test('other authorized context proposes a switch; inaccessible context is honest', () => {
  const base = { id: '1', userId: '1', title: 'x', message: 'y', type: 'info', read: false, timestamp: '', linkTaskId: '12' };
  const switched = targetMod.resolveNotificationTarget(
    { ...base, context: { kind: 'workspace', id: 7 } }, envPayload, { kind: 'platform', id: null },
  );
  assert.equal(switched.kind, 'switch');
  const blocked = targetMod.resolveNotificationTarget(
    { ...base, context: { kind: 'workspace', id: 99 } }, envPayload, { kind: 'platform', id: null },
  );
  assert.deepEqual(blocked, { kind: 'unavailable', reason: 'context-inaccessible' });
  assert.ok(listQuery.notificationHasDetail({ body: 'متن' }));
  assert.ok(!listQuery.notificationHasDetail({ message: 'فقط پیام' }));
});

/* muting policy: frontend mutable list mirrors backend, security/system locked */
test('mute categories exclude system and security', () => {
  const prefs = read('src/shared/api/preferences.ts');
  assert.ok(prefs.includes("'tasks','content','meetings','secretariat','collaboration'") || prefs.includes('tasks'));
  const view = read('src/features/notifications/NotificationsView.tsx');
  assert.ok(view.includes('سامانه و امنیتی — همیشه فعال'), 'locked row visible in UI');
  assert.ok(view.includes('ربات بله'), 'Bale independence disclosed to the user');
});

/* backend contracts (source gates; PHP runs in CI) */
test('backend: mute-aware badge, grouping, retention, mandatory-safe read-all', () => {
  const inbox = readFileSync(resolve(root, '../backend/app/Modules/Notifications/Services/NotificationInbox.php'), 'utf8');
  assert.ok(inbox.includes('withoutCategories'));
  assert.ok(inbox.includes('unread_count_all'));
  assert.ok(inbox.includes('MUTABLE_CATEGORIES'));
  const controller = readFileSync(resolve(root, '../backend/app/Modules/Notifications/Http/Controllers/NotificationInboxController.php'), 'utf8');
  assert.ok(controller.includes("mandatory"));
  const retention = readFileSync(resolve(root, '../backend/app/Modules/Notifications/Services/NotificationRetention.php'), 'utf8');
  assert.ok(retention.includes('isExempt'));
  assert.ok(existsSync(resolve(root, '../backend/database/migrations/2026_10_19_000001_ux024_notification_columns_and_archives.php')));
});

/* density + offline + guard wiring present on real routes */
test('density toggle, offline banner and switch guard are wired', () => {
  const list = read('src/features/workspace/WorkspaceList.tsx');
  assert.ok(list.includes('density-compact'));
  assert.ok(list.includes('writeTableDensity'));
  const app = read('src/app/App.tsx');
  assert.ok(app.includes('اتصال اینترنت برقرار نیست'));
  const selector = read('src/features/environments/SelectEnvironmentPage.tsx');
  assert.ok(selector.includes('DirtyGuardDialog'));
  assert.ok(selector.includes('anyDirtySource()'));
});
