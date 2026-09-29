import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readRuntime } from '../src/config/runtime.ts';
import { ApiError, parseApiError } from '../src/api/errors.ts';
import { resolveRoute, viewPaths } from '../src/routing/routes.ts';
import { rememberServerRecords, needsServerWrite, clearServerSnapshots } from '../src/queries/serverSnapshots.ts';

test('demo requires exact explicit true, never a default or truthy string', () => {
  for (const value of [undefined, false, true, '', 'false', '1', 'TRUE']) assert.equal(readRuntime({ VITE_DEMO_MODE: value }).demoMode, false);
  assert.equal(readRuntime({ VITE_DEMO_MODE: 'true' }).demoMode, true);
  assert.equal(readRuntime({}).apiUrl, '/api/v1');
  assert.equal(readRuntime({ VITE_API_URL: 'https://api.example.test/api/v1/' }).apiUrl, 'https://api.example.test/api/v1');
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
