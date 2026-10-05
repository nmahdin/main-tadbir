import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readRuntime } from '../src/config/runtime.ts';
import { ApiConnectionError, ApiError, parseApiError } from '../src/api/errors.ts';
import { resolveRoute, viewPaths } from '../src/routing/routes.ts';
import { rememberServerRecords, needsServerWrite, clearServerSnapshots } from '../src/queries/serverSnapshots.ts';

test('demo requires exact explicit true, never a default or truthy string', () => {
  for (const value of [undefined, false, true, '', 'false', '1', 'TRUE']) assert.equal(readRuntime({ VITE_DEMO_MODE: value }).demoMode, false);
  assert.equal(readRuntime({ VITE_DEMO_MODE: 'true' }).demoMode, true);
  assert.equal(readRuntime({}).apiUrl, '/api/v1');
  assert.equal(readRuntime({ VITE_API_URL: 'https://api.example.test/api/v1/' }).apiUrl, 'https://api.example.test/api/v1');
});
test('production builds always target the real API and Sanctum host', () => {
  const production = readRuntime({ PROD: true });
  assert.equal(production.apiUrl, 'https://api-tadbir.morvarid-daron.ir/api/v1');
  assert.equal(production.sanctumUrl, 'https://api-tadbir.morvarid-daron.ir');
  const override = readRuntime({ PROD: true, VITE_API_URL: 'https://other.example/api/', VITE_SANCTUM_URL: 'https://other.example/' });
  assert.equal(override.apiUrl, 'https://other.example/api');
  assert.equal(override.sanctumUrl, 'https://other.example');
});
test('all main navigation paths resolve, invalid IDs and unknown routes do not become dashboard', () => {
  for (const path of Object.values(viewPaths)) assert.equal(resolveRoute(path).known, true);
  for (const path of ['/projects/123', '/tasks/123', '/contents/123']) assert.equal(resolveRoute(path).id, '123');
  for (const path of ['/projects/0', '/tasks/-1', '/contents/x', '/missing', '/projects/1/extra']) assert.equal(resolveRoute(path).known, false);
  assert.equal(resolveRoute('/contents/published').view, 'content-published');
});
test('error parser keeps validation field errors but never renders raw internal SQL', () => {
  const fields = { deadline: ['تاریخ پایان معتبر نیست.'] };
  assert.deepEqual(parseApiError(new ApiError('bad', 422, fields)).fields, fields);
  assert.match(parseApiError(new ApiError('SQLSTATE secret', 500)).message, /عملیات انجام نشد/);
  assert.match(parseApiError(new ApiError('', 403)).message, /مجوز/);
  assert.match(parseApiError(new ApiError('', 419)).message, /نشست/);
  assert.match(parseApiError(new TypeError('fetch failed')).message, /ارتباط با سرور/);
  assert.match(parseApiError(new ApiConnectionError('آدرس اتصال پنل به بک‌اند نامعتبر است.', 502)).message, /آدرس اتصال/);
});
test('legacy autosave never treats initial API reads as changes and isolates accounts', () => {
  clearServerSnapshots(); const record = { id: '1', title: 'stored' };
  assert.equal(needsServerWrite('a', 'contents', record), false);
  rememberServerRecords('a', 'contents', [record]);
  assert.equal(needsServerWrite('a', 'contents', record), false);
  assert.equal(needsServerWrite('a', 'contents', { ...record, title: 'edited' }), true);
  assert.equal(needsServerWrite('b', 'contents', { ...record, title: 'edited' }), false);
  clearServerSnapshots(); assert.equal(needsServerWrite('a', 'contents', { ...record, title: 'edited' }), false);
});
test('AppContext no longer stores domain data in localStorage or imports INITIAL records', async () => {
  const app = await readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /localStorage|INITIAL_|data\/initial/);
  assert.match(app, /useServerState<Project\[\]>/);
  assert.match(app, /useAuth\(\)/); assert.match(app, /useUI\(\)/);
});
test('login and icon controls keep the requested shared visual contract', async () => {
  const [auth, primitives, styles, settings, published, app] = await Promise.all([
    readFile(new URL('../src/components/auth/AuthModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/common/Primitives.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/SettingsView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/content/ContentPublishedView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(auth, /نسخه سازمانی|سامانه جامع مدیریت پروژه‌ها/);
  assert.match(auth, /loginDescription/);
  assert.match(settings, /توضیح اختیاری صفحهٔ ورود/);
  assert.match(primitives, /purpose\?: 'default' \| 'back' \| 'close'/);
  assert.match(styles, /ui-icon-button-back/);
  assert.match(styles, /ui-icon-button-close/);
  assert.match(styles, /@fontsource-variable\/vazirmatn/);
  assert.match(published, /purpose="back"/);
  assert.match(app, /activeView === 'messages' \? 'p-0'/);
});

test('sidebar navigation uses a full-screen loader, comments are managed with settings, and workspace cross-navigation is removed', async () => {
  const [app, sidebar, workspace, styles] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workspace/WorkspaceList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /pendingSidebarView/);
  assert.match(app, /WorkspaceLoader label="در حال بارگذاری صفحه…"/);
  assert.match(sidebar, /onNavigateStart/);
  assert.match(sidebar, /مدیریت سامانه/);
  assert.match(sidebar, /کار روزانه/);
  assert.match(sidebar, /برنامه‌ریزی و اجرا/);
  assert.match(sidebar, /id="nav-item-comments"/);
  assert.doesNotMatch(workspace, /ماژول‌های کاری|MAIN_TABS/);
  assert.match(styles, /background-image: none !important/);
  assert.match(styles, /box-shadow: none !important/);
  assert.match(styles, /transform: none !important/);
  assert.doesNotMatch(styles, /\.ui-button-(?:primary|secondary|danger|success|warning)[^\n]*linear-gradient/);
});

import { activateSnapshotSession, snapshotSession, rememberApiResponse } from '../src/queries/serverSnapshots.ts';
test('newly created server records are not autosaved again and late responses cannot seed another session', () => {
  activateSnapshotSession('a'); const scope = snapshotSession();
  rememberApiResponse(scope, '/contents', { data: { id: '4', title: 'created' } });
  assert.equal(needsServerWrite('a', 'contents', { id: '4', title: 'created' }), false);
  assert.equal(needsServerWrite('a', 'contents', { id: '4', title: 'changed' }), true);
  activateSnapshotSession('b');
  rememberApiResponse(scope, '/contents/4', { data: { id: '4', title: 'old account' } });
  assert.equal(needsServerWrite('b', 'contents', { id: '4', title: 'changed' }), false);
});

import { SessionChangedError } from '../src/api/errors.ts';
test('local session cancellation is distinguishable from a real server 409 conflict', () => {
  const cancelled = new SessionChangedError();
  const conflict = new ApiError('نسخه تغییر کرده است', 409);
  assert.equal(cancelled.status, 409);
  assert.ok(cancelled instanceof SessionChangedError);
  assert.ok(!(conflict instanceof SessionChangedError));
  assert.equal(parseApiError(conflict).message, 'نسخه تغییر کرده است');
});
test('a new login of the same user rotates the session and cannot receive old snapshots', () => {
  activateSnapshotSession('same-user');
  const previous = snapshotSession();
  activateSnapshotSession('same-user');
  assert.notEqual(snapshotSession(), previous);
  assert.ok(snapshotSession().epoch > previous.epoch);
  rememberApiResponse(previous, '/users', { data: [{ id: '1', name: 'previous login' }] });
  assert.equal(needsServerWrite('same-user', 'users', { id: '1', name: 'current login' }), false);
});
