import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  parseListQuery,
  parseSortSpec,
  serializeSortSpec,
  cycleSortField,
} from '../src/app/router/listQuery.ts';

// UX-02-3 gates:
//  - multi-sort URL state: allowlisted spec, explicit precedence,
//    unique fields, ≤3 criteria, stable serialization; the legacy
//    sort+direction pair keeps working;
//  - migrated surfaces: RTL filter drawer with draft/Apply, mobile
//    cards, persisted column visibility, projects CSV export slot;
//  - addendum: typed shell navigation, PageSurface adoption,
//    state-only detail tabs.

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('multi-sort spec parses, validates, and serializes deterministically', () => {
  assert.deepEqual(parseSortSpec('priority:asc,deadline:desc', 'tasks'), [
    { field: 'priority', direction: 'asc' },
    { field: 'deadline', direction: 'desc' },
  ]);
  assert.equal(serializeSortSpec(parseSortSpec('priority:asc,deadline:desc', 'tasks')), 'priority:asc,deadline:desc');
  // Unknown column, duplicate field, bad direction, >3 criteria, and
  // module-ineligible fields are all rejected outright.
  assert.equal(parseSortSpec('password:asc', 'tasks'), null);
  assert.equal(parseSortSpec('deadline:asc,deadline:desc', 'tasks'), null);
  assert.equal(parseSortSpec('deadline:sideways', 'tasks'), null);
  assert.equal(parseSortSpec('deadline:asc,created_at:asc,updated_at:asc,priority:asc', 'tasks'), null);
  assert.equal(parseSortSpec('priority:asc', 'contents'), null);
  // Legacy single field still parses (direction defaults desc).
  assert.deepEqual(parseSortSpec('deadline', 'projects'), [{ field: 'deadline', direction: 'desc' }]);
});

test('header sort cycling: asc → desc → removed, precedence preserved, capped at three', () => {
  let spec = [];
  spec = cycleSortField(spec, 'deadline');
  assert.deepEqual(spec, [{ field: 'deadline', direction: 'asc' }]);
  spec = cycleSortField(spec, 'priority');
  spec = cycleSortField(spec, 'deadline');
  assert.deepEqual(spec, [
    { field: 'deadline', direction: 'desc' },
    { field: 'priority', direction: 'asc' },
  ]);
  spec = cycleSortField(spec, 'deadline');
  assert.deepEqual(spec, [{ field: 'priority', direction: 'asc' }]);
  spec = cycleSortField(spec, 'created_at');
  spec = cycleSortField(spec, 'updated_at');
  spec = cycleSortField(spec, 'deadline');
  assert.equal(spec.length, 3, 'a fourth criterion is never added');
});

test('list query keeps multi-sort in the URL and drops stale direction', () => {
  const parsed = parseListQuery('?sort=priority:asc,deadline:desc&direction=asc&page=2&per_page=50', 'projects', [], []);
  assert.equal(parsed.sort, 'priority:asc,deadline:desc');
  assert.equal(parsed.direction, undefined);
  assert.equal(parsed.page, '2');
  assert.equal(parsed.per_page, '50');

  const legacy = parseListQuery('?sort=deadline&direction=asc', 'tasks', [], []);
  assert.equal(legacy.sort, 'deadline');
  assert.equal(legacy.direction, 'asc');

  const hostile = parseListQuery('?sort=users.password:asc', 'projects', [], []);
  assert.equal(hostile.sort, undefined, 'non-allowlisted sort never reaches the API');
});

test('workspace list: drawer filters, mobile cards, column visibility, export slot', async () => {
  const list = await read('../src/features/workspace/WorkspaceList.tsx');
  assert.match(list, /role="dialog" aria-modal="true" aria-label="فیلترهای پیشرفته"/);
  assert.match(list, /applyFilters/);
  assert.match(list, /setFilterDraft\(\{\}\)/, 'drawer Clear resets the draft');
  assert.match(list, /md:hidden/, 'mobile entity cards replace the wide table');
  assert.match(list, /visibleColumnDefs\.map/, 'columns render in persisted order');
  assert.match(list, /renderCell\(definition\.key, row\)/, 'cells follow the ordered definitions');
  assert.match(list, /applyColumnOrder/, 'stored column order drives rendering');
  assert.match(list, /dropColumnOn|reorderColumn/, 'drag plus button reordering');
  assert.match(list, /user\.experience\.list_columns|readListColumnPreferences/);
  assert.match(list, /خروجی پروژه‌ها/);
  assert.match(list, /export\.xlsx/, 'XLSX export path offered alongside CSV');
  assert.match(list, /downloadRequest\(isXlsx \? `\/projects\/export\.xlsx\?\$\{params\.toString\(\)\}` : `\/projects\/export\?\$\{params\.toString\(\)\}`\)/, 'CSV and XLSX share the same scoped export params');
  assert.match(list, /<PageSurface className="space-y-5">/);
  assert.match(list, /cycleSortField/);
  assert.doesNotMatch(list, /bg-indigo-600|bg-violet-600|text-indigo-700/);
});

test('column preferences client is shared, version-checked, presentation-only', async () => {
  const prefs = await read('../src/shared/api/preferences.ts');
  assert.match(prefs, /user\.experience\.list_columns/);
  assert.match(prefs, /expected_version/);
});


test('addendum: typed shell navigation + PageSurface adoption + state-only detail tabs', async () => {
  const nav = await read('../src/app/shell/navigation.ts');
  assert.match(nav, /ORGANIZATION_NAV/);
  assert.match(nav, /PLATFORM_NAV/);
  assert.match(nav, /permission\?: string/);
  const sidebar = await read('../src/app/shell/Sidebar.tsx');
  assert.match(sidebar, /ORGANIZATION_NAV\.map/);
  assert.match(sidebar, /PLATFORM_NAV\.map/);
  assert.doesNotMatch(sidebar, /bg-indigo-600|text-indigo-700/);

  const surface = await read('../src/shared/ui/PageSurface.tsx');
  assert.match(surface, /bg-white/);
  assert.match(surface, /data-surface="page"/, 'PageSurface has a stable flat-wrapper marker');
  assert.doesNotMatch(surface, /shadow-surface/, 'PageSurface must not receive standalone-card elevation');

  const detail = await read('../src/features/projects/ProjectDetailView.tsx');
  assert.match(detail, /<PageSurface className="space-y-5">/);
  assert.doesNotMatch(detail, /nextParams\.set\('tab'/, 'internal tabs must not rewrite the URL');
  assert.match(detail, /aria-label="مسیر صفحه"/, 'breadcrumb at the RTL start of the detail header');

  const scoped = await read('../src/features/settings/components/ScopedSettingsPage.tsx');
  assert.match(scoped, /<PageSurface containerClassName="max-w-5xl"/);

  const selector = await read('../src/features/environments/SelectEnvironmentPage.tsx');
  assert.match(selector, /min-h-24/, 'large button-like environment cards');
  assert.doesNotMatch(selector, /descriptorCard/, 'recents card builder is gone with the section');
});
