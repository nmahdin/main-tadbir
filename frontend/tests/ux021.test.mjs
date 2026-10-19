import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  defaultEnvironment,
  environmentKey,
  filterPayload,
  groupedWorkspaces,
  landingPathFor,
  normalizeSearchText,
  parseRecents,
  parseSelection,
  pushRecent,
  resolveEnvironment,
  validRecents,
} from '../src/shared/lib/environments.ts';
import { errorStateKind, isInvalidContextError } from '../src/shared/lib/errorStates.ts';
import { ApiError } from '../src/shared/api/errors.ts';

// UX-02-1 regression gates:
//  - environment resolution mirrors the server payload exactly
//    (suspended orgs / ended memberships / revoked platform access
//    resolve to "no environment", never to a fabricated one);
//  - recents persist identifiers only and drop stale entries;
//  - switching isolates caches via removeQueries (never invalidate,
//    so skipToken cache-only queries can never fetch — 01.1 contract);
//  - illustrated states map from status/code/connectivity;
//  - the shell offers three environment variants + profile dock and
//    the /select-environment route is registered behind auth.

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

function payload(overrides = {}) {
  return {
    platform: { eligible: false, is_primary: false, permissions: [] },
    organizations: [
      { id: 7, name: 'سازمان آلفا', slug: 'alpha', status: 'active', role: { key: 'organization_manager', name: 'مدیر سازمان' }, permissions: ['organization.view', 'organization.manage'] },
      { id: 9, name: 'Beta Org', slug: 'beta', status: 'active', role: { key: 'organization_member', name: 'عضو سازمان' }, permissions: ['organization.view'] },
    ],
    workspaces: [
      { id: 3, name: 'فضای شخصی', organization_id: null, organization_name: null, is_default: true, relation: 'owner', role: { key: 'manager', name: 'مدیر فضای کاری' }, permissions: ['workspace.view'] },
      { id: 4, name: 'فضای دوم', organization_id: null, organization_name: null, is_default: false, relation: 'owner', role: null, permissions: [] },
      { id: 8, name: 'تیم فروش', organization_id: 7, organization_name: 'سازمان آلفا', is_default: false, relation: 'member', role: { key: 'member', name: 'عضو' }, permissions: ['workspace.view'] },
    ],
    ...overrides,
  };
}

test('platform environment resolves only when eligible', () => {
  assert.equal(resolveEnvironment(payload(), { kind: 'platform', id: null }), null);
  const eligible = payload({ platform: { eligible: true, is_primary: true, permissions: ['platform.users.view'] } });
  const descriptor = resolveEnvironment(eligible, { kind: 'platform', id: null });
  assert.equal(descriptor.name, 'مدیریت پلتفرم');
  assert.equal(descriptor.standing, 'مدیر اصلی پلتفرم');
});

test('organization and workspace resolution mirrors payload membership', () => {
  const data = payload();
  assert.equal(resolveEnvironment(data, { kind: 'organization', id: 7 }).standing, 'مدیر سازمان');
  assert.equal(resolveEnvironment(data, { kind: 'organization', id: 42 }), null);
  assert.equal(resolveEnvironment(data, { kind: 'workspace', id: 8 }).organizationName, 'سازمان آلفا');
  assert.equal(resolveEnvironment(data, { kind: 'workspace', id: 42 }), null);
  // The unpinned workspace shell (legacy default) is always enterable.
  assert.equal(resolveEnvironment(data, { kind: 'workspace', id: null }).name, 'محیط کاری');
});

test('default environment prefers the default personal workspace', () => {
  assert.deepEqual(defaultEnvironment(payload()), { kind: 'workspace', id: 3 });
  assert.deepEqual(defaultEnvironment(payload({ workspaces: [], organizations: [{ id: 5, name: 'X', slug: 'x', status: 'active', role: null, permissions: [] }] })), { kind: 'organization', id: 5 });
  assert.deepEqual(defaultEnvironment(payload({ workspaces: [], organizations: [], platform: { eligible: true, is_primary: false, permissions: [] } })), { kind: 'platform', id: null });
  assert.deepEqual(defaultEnvironment(payload({ workspaces: [], organizations: [] })), { kind: 'workspace', id: null });
});

test('workspaces group into personal and per-organization buckets', () => {
  const groups = groupedWorkspaces(payload());
  assert.deepEqual(groups.personal.map(item => item.id), [3, 4]);
  assert.equal(groups.organizations.length, 1);
  assert.equal(groups.organizations[0].organizationName, 'سازمان آلفا');
  assert.deepEqual(groups.organizations[0].items.map(item => item.id), [8]);
});

test('search normalizes Arabic variants and filters by name', () => {
  assert.equal(normalizeSearchText('  سازمان   آلفا '), 'سازمان آلفا');
  const data = payload();
  // Arabic ي/ك input must still find the Persian-named organization.
  const filtered = filterPayload(data, 'سازمان');
  assert.equal(filtered.organizations.length, 1);
  assert.equal(filtered.workspaces.length, 1); // via organization_name match
  assert.equal(filterPayload(data, 'beta').organizations[0].id, 9);
  assert.equal(filterPayload(data, 'چیز ناموجود').organizations.length, 0);
});

test('recents keep identifiers only, dedupe, cap, and drop stale entries', () => {
  let recents = [];
  recents = pushRecent(recents, { kind: 'organization', id: 7 }, 100);
  recents = pushRecent(recents, { kind: 'workspace', id: 3 }, 200);
  recents = pushRecent(recents, { kind: 'organization', id: 7 }, 300);
  assert.deepEqual(recents.map(item => environmentKey({ kind: item.kind, id: item.id })), ['organization:7', 'workspace:3']);
  assert.ok(recents.every(item => Object.keys(item).sort().join(',') === 'at,id,kind'));
  const data = payload();
  assert.equal(validRecents(recents, data).length, 2);
  // Organization 7 leaves the payload (suspended): its recent drops.
  const shrunk = payload({ organizations: data.organizations.filter(item => item.id !== 7) });
  assert.deepEqual(validRecents(recents, shrunk).map(item => item.kind), ['workspace']);
  assert.deepEqual(parseRecents('not json'), []);
  assert.deepEqual(parseRecents('[{"kind":"workspace","id":3,"at":1},{"kind":"bogus","id":1,"at":2}]'), [{ kind: 'workspace', id: 3, at: 1 }]);
});

test('stored selection parses defensively', () => {
  assert.deepEqual(parseSelection('{"kind":"organization","id":7}'), { kind: 'organization', id: 7 });
  assert.deepEqual(parseSelection('{"kind":"platform","id":null}'), { kind: 'platform', id: null });
  assert.equal(parseSelection('{"kind":"platform","id":3}'), null);
  assert.equal(parseSelection('{"kind":"bogus","id":1}'), null);
  assert.equal(parseSelection('{"kind":"organization","id":"7"}'), null);
  assert.equal(parseSelection(null), null);
});

test('landing paths: workspace is the daily shell, management lands on scoped settings', () => {
  assert.equal(landingPathFor({ kind: 'workspace', id: 3 }), '/dashboard');
  assert.equal(landingPathFor({ kind: 'organization', id: 7 }), '/scoped-settings');
  assert.equal(landingPathFor({ kind: 'platform', id: null }), '/scoped-settings');
});

test('error states map from status, code and connectivity', () => {
  assert.equal(errorStateKind(new ApiError('x', 403), true), 'forbidden');
  assert.equal(errorStateKind(new ApiError('x', 404), true), 'not-found');
  assert.equal(errorStateKind(new ApiError('x', 409), true), 'conflict');
  assert.equal(errorStateKind(new ApiError('x', 500), true), 'server');
  assert.equal(errorStateKind(new ApiError('x', 0), true), 'offline');
  assert.equal(errorStateKind(new ApiError('x', 500), false), 'offline');
  assert.equal(errorStateKind(new Error('boom'), true), 'generic');
  assert.equal(isInvalidContextError(new ApiError('x', 403, undefined, { code: 'organization_unavailable' })), true);
  assert.equal(isInvalidContextError(new ApiError('x', 403, undefined, { code: 'permission_missing' })), false);
});

test('environment switching isolates caches with removeQueries, never invalidateQueries', () => {
  const provider = read('../src/app/providers/EnvironmentContext.tsx');
  assert.match(provider, /queryClient\.removeQueries\(/);
  assert.doesNotMatch(provider, /invalidateQueries/);
  // Session identity + environment discovery survive a switch.
  assert.match(provider, /root !== 'session' && root !== 'environments'/);
  // Persistence stores identifiers only, keyed by user id.
  assert.match(provider, /tadbir:environment:\$\{userId\}/);
  assert.match(provider, /tadbir:environment-recents:\$\{userId\}/);
});

test('shell wiring: route, variants, dock, collapse, illustrated 404/403', () => {
  const app = read('../src/app/App.tsx');
  assert.match(app, /path="\/select-environment"/);
  assert.match(app, /<EnvironmentProvider>/);
  const sidebar = read('../src/app/shell/Sidebar.tsx');
  assert.match(sidebar, /environmentKind === 'organization'/);
  assert.match(sidebar, /environmentKind === 'platform'/);
  assert.match(sidebar, /<ProfileDock collapsed=\{collapsed\} onNavigate=\{onClose\} \/>/);
  assert.match(sidebar, /sidebar-environment-chip/);
  assert.match(sidebar, /tadbir:sidebar-collapsed/);
  const dock = read('../src/app/shell/ProfileDock.tsx');
  assert.match(dock, /DropdownMenu/);
  assert.match(dock, /انتخاب یا تغییر محیط/);
  const routeEntity = read('../src/app/router/RouteEntity.tsx');
  assert.match(routeEntity, /<NotFoundState \/>/);
  assert.match(routeEntity, /<ForbiddenState \/>/);
  const illustrated = read('../src/shared/ui/IllustratedState.tsx');
  for (const kind of ['forbidden', 'not-found', 'conflict', 'server', 'offline', 'invalid-context']) {
    assert.match(illustrated, new RegExp(`['"]?${kind}['"]?:`), `illustrated state missing: ${kind}`);
  }
  for (const wrapper of ['ForbiddenState', 'NotFoundState', 'ConflictState', 'ServerErrorState', 'OfflineState', 'InvalidContextState']) {
    assert.match(illustrated, new RegExp(`export function ${wrapper}\\b`), `illustrated wrapper missing: ${wrapper}`);
  }
  // Canonical ocean only: the illustration consumes theme variables.
  assert.match(illustrated, /var\(--color-primary\)/);
  assert.doesNotMatch(illustrated, /#39677c/i);
});

test('visual-audit fixes: ocean default theme, dock truncation, drawer Escape, card focus', () => {
  // F1 — the shell default theme must be the canonical ocean, not the
  // legacy indigo (a saved user themeColor still wins in App.tsx).
  const appContext = read('../src/app/providers/AppContext.tsx');
  assert.match(appContext, /themeColor: '#39677c'/);
  const app = read('../src/app/App.tsx');
  assert.match(app, /: '#39677c';/);
  // F2 — the profile dock truncates inside the fixed 256px sidebar
  // instead of growing a 388px trigger past its edge.
  const dock = read('../src/app/shell/ProfileDock.tsx');
  assert.match(dock, /\[&>div\]:w-full \[&>div>button\]:w-full/);
  assert.match(dock, /flex min-w-0 flex-1 items-center gap-2\.5/);
  // F3 — the mobile drawer closes on Escape.
  const sidebar = read('../src/app/shell/Sidebar.tsx');
  assert.match(sidebar, /if \(!isOpen\) return;/);
  assert.match(sidebar, /e\.key === 'Escape'\) onClose\(\)/);
  // F4 (investigated, not a defect): environment cards inherit the
  // canonical global button focus (styles/index.css — 2px, 70% primary
  // mix); they must not fork their own outline color.
  const page = read('../src/features/environments/SelectEnvironmentPage.tsx');
  assert.doesNotMatch(page, /outline-primary|--tw-outline-color/);
});

test('selector page: search, groups, honest empty states (UX-02-3: no recents)', () => {
  const page = read('../src/features/environments/SelectEnvironmentPage.tsx');
  assert.match(page, /SearchInput/);
  // UX-02-3 addendum: the Recently Used section/badges/grouping are
  // removed completely; environments are large button-like cards.
  assert.doesNotMatch(page, /اخیراً استفاده‌شده/);
  assert.doesNotMatch(page, /recents\.length/);
  assert.match(page, /min-h-24/);
  assert.match(page, /<PageSurface containerClassName="max-w-3xl">/);
  assert.match(page, /فضاهای کاری شخصی/);
  assert.match(page, /سازمان‌های من/);
  assert.match(page, /OfflineState/);
  assert.match(page, /InvalidContextState/);
  // Scoped settings preselects the active environment scope (S6).
  const scoped = read('../src/features/settings/components/ScopedSettingsPage.tsx');
  assert.match(scoped, /environmentSelection\.kind === 'organization'/);
  assert.match(scoped, /environmentSelection\.kind === 'workspace'/);
  assert.match(scoped, /environmentSelection\.kind === 'platform'/);
});
