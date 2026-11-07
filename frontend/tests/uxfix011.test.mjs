import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QueryClient, QueryObserver, skipToken } from '@tanstack/query-core';
import { resolveRoute, viewPaths } from '../src/app/router/routes.ts';

// CORE-UX-FIX-01.1 regression gates:
//  (a) Scoped Settings must be routable — the sidebar click used to
//      navigate to the /dashboard fallback because viewPaths had no
//      'scoped-settings' entry, so the page never mounted and issued
//      no requests (the "blank page" report).
//  (b) Cache-only queries (useServerState, RouteEntity collection
//      peek) must be explicitly marked skipToken. Without a queryFn,
//      React Query logs "No queryFn was passed as an option…" on
//      every render in development even with enabled:false; with
//      skipToken the query can never enter a fetch path and never
//      fabricates data.

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('scoped-settings is a real route end to end', () => {
  assert.equal(viewPaths['scoped-settings'], '/scoped-settings');
  assert.deepEqual(resolveRoute('/scoped-settings'), { view: 'scoped-settings', known: true });
  assert.deepEqual(resolveRoute('/scoped-settings/'), { view: 'scoped-settings', known: true });
  const app = read('../src/app/App.tsx');
  assert.match(app, /case 'scoped-settings':\s*\n(?:.*\n)*?\s*return <ScopedSettingsPage \/>;/);
  const sidebar = read('../src/app/shell/Sidebar.tsx');
  assert.match(sidebar, /handleNavClick\('scoped-settings'\)/);
});

test('every non-detail ActiveView resolves to a path (no silent /dashboard fallback)', () => {
  const types = read('../src/shared/types.ts');
  const views = [...types.match(/export type ActiveView =([^;]+);/s)[1].matchAll(/'([\w-]+)'/g)].map(m => m[1]);
  // Detail views are intentionally path-less: setActiveView routes
  // them through the selected project/content id.
  const detailOnly = new Set(['project-detail', 'content-detail']);
  for (const view of views) {
    if (detailOnly.has(view)) continue;
    assert.ok(viewPaths[view], `ActiveView '${view}' has no route path`);
    const resolved = resolveRoute(viewPaths[view]);
    assert.equal(resolved.known, true, `path for '${view}' must resolve as known`);
  }
});

test('cache-only queries carry skipToken; network queries keep real queryFns', () => {
  const serverState = read('../src/shared/queries/useServerState.ts');
  assert.match(serverState, /queryFn: skipToken, enabled: false/);
  assert.match(serverState, /from '@tanstack\/react-query'/);
  const routeEntity = read('../src/app/router/RouteEntity.tsx');
  assert.match(routeEntity, /queryFn: skipToken, enabled: false/);
  // The entity query is network-backed and must keep its fetcher.
  assert.match(routeEntity, /queryFn: async \(\) => \(await \(\{ projects: projectsApi, tasks: tasksApi, contents: contentsApi \}\[route\.module!\]\.get\(route\.id!\)\)\)\.data/);
  // fetchWorkspace remains the single network entry for cache-only state.
  const queryClient = read('../src/shared/queries/queryClient.ts');
  assert.match(queryClient, /fetchQuery\(\{ queryKey: workspaceKey\(userId, name\), queryFn:/);
});

test('skipToken cache-only query never fetches, never errors, still holds cache data', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const errors = [];
  client.getQueryCache().subscribe(event => {
    if (event.action?.type === 'error') errors.push(String(event.action.error?.message ?? ''));
  });
  const key = ['workspace', 'user-1', 'projects'];
  const observer = new QueryObserver(client, { queryKey: key, queryFn: skipToken, enabled: false });
  const unsubscribe = observer.subscribe(() => {});

  // Nothing was fabricated: an untouched cache reads back as pending.
  assert.equal(observer.getCurrentResult().status, 'pending');
  assert.equal(observer.getCurrentResult().data, undefined);

  // The fetchWorkspace path (explicit queryFn) populates the same key.
  await client.fetchQuery({ queryKey: key, queryFn: async () => [{ id: 'p1' }] });
  assert.deepEqual(observer.getCurrentResult().data, [{ id: 'p1' }]);

  // Setters and broad invalidations must not drive it into a fetch
  // path that demands a queryFn (the reported console spam).
  client.setQueryData(key, previous => [...previous, { id: 'p2' }]);
  await client.invalidateQueries({ queryKey: ['workspace', 'user-1'] });
  assert.deepEqual(errors, []);
  assert.deepEqual(observer.getCurrentResult().data, [{ id: 'p1' }, { id: 'p2' }]);
  unsubscribe();
});

test('workspace cache keys isolate per authenticated user (no cross-scope leak)', () => {
  const client = new QueryClient();
  const userA = ['workspace', 'user-a', 'tasks'];
  const userB = ['workspace', 'user-b', 'tasks'];
  client.setQueryData(userA, [{ id: 'task-a' }]);
  assert.deepEqual(client.getQueryData(userA), [{ id: 'task-a' }]);
  assert.equal(client.getQueryData(userB), undefined, 'another user must not see the cached rows');
  // Session changes clear the whole cache (AuthContext contract).
  client.clear();
  assert.equal(client.getQueryData(userA), undefined);
  const auth = read('../src/app/providers/AuthContext.tsx');
  assert.match(auth, /queryClient\.clear\(\)/);
});

test('scoped settings renders visible loading, denied, error and empty states', () => {
  const page = read('../src/features/settings/components/ScopedSettingsPage.tsx');
  // Scope lists: loading skeleton must win over the empty state.
  assert.match(page, /scopesLoading \? \(\s*<Skeleton \/>/);
  // 403 on the scope lists is an explicit no-permission state.
  assert.match(page, /setScopesDenied\(error instanceof ApiError && error\.status === 403\)/);
  assert.match(page, /variant="no-permission" title="دسترسی به دامنه‌ها ندارید"/);
  // Genuine emptiness and failures stay distinct and visible.
  assert.match(page, /title="سازمانی یافت نشد"/);
  assert.match(page, /title="دریافت تنظیمات ناموفق بود"/);
  assert.match(page, /title="دریافت دامنه‌ها ناموفق بود"/);
  // Unauthorized cross-organization access is decided by the server;
  // the page only ever requests ids from the caller's own memberships.
  assert.match(page, /scopedSettingsApi\.organizations\(\)/);
  assert.match(page, /scopedSettingsApi\.organizationSettings\(organizationId\)/);
});
