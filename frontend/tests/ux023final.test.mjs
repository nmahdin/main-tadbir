import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('ux-02-3-final: column order helpers keep mandatory columns anchored', async () => {
  const { applyColumnOrder, moveInOrder, normalizeModuleColumnPreference } = await import('../src/shared/api/columnPreferences.ts');
  const definitions = [
    { key: 'title', mandatory: true },
    { key: 'status' },
    { key: 'priority' },
    { key: 'deadline' },
    { key: 'actions', mandatory: true },
  ];
  assert.deepEqual(
    applyColumnOrder(definitions, ['deadline', 'status', 'ghost']).map((definition) => definition.key),
    ['title', 'deadline', 'status', 'priority', 'actions'],
    'stored order wins for free columns; unknown keys dropped; unlisted keep default order',
  );
  assert.deepEqual(
    applyColumnOrder(definitions, []).map((definition) => definition.key),
    ['title', 'status', 'priority', 'deadline', 'actions'],
  );
  assert.deepEqual(moveInOrder(['status', 'priority', 'deadline'], 'priority', 1), ['status', 'deadline', 'priority']);
  assert.deepEqual(moveInOrder(['status', 'priority'], 'status', -1), ['status', 'priority'], 'edges are no-ops');
  assert.deepEqual(moveInOrder(['status'], 'ghost', 1), ['status']);
});

test('ux-02-3-final: v1 column preference stays readable as v2', async () => {
  const { normalizeModuleColumnPreference } = await import('../src/shared/api/columnPreferences.ts');
  assert.deepEqual(normalizeModuleColumnPreference(['status']), { hidden: ['status'], order: [] });
  assert.deepEqual(normalizeModuleColumnPreference({ hidden: ['status'], order: ['deadline'] }), { hidden: ['status'], order: ['deadline'] });
  assert.deepEqual(normalizeModuleColumnPreference(null), { hidden: [], order: [] });
  assert.deepEqual(normalizeModuleColumnPreference({ hidden: [1, 'status'] }), { hidden: ['status'], order: [] });
});

test('ux-02-3-final: tasks bulk selection is page-scoped and confirmed', async () => {
  const list = await read('../src/features/workspace/WorkspaceList.tsx');
  assert.match(list, /\/tasks\/bulk-status/, 'bulk posts to the per-record-authorized endpoint');
  assert.match(list, /انتخاب همهٔ وظیفه‌های این صفحه/, 'select-all is explicitly page-scoped');
  assert.match(list, /setSelectedIds\(\[\]\);\n    setBulkReport\(null\);/, 'selection clears when URL state changes');
  assert.match(list, /<ConfirmDialog/, 'bulk action requires confirmation');
  assert.match(list, /bulkReport/, 'per-record outcome report is rendered');
});

test('ux-02-3-final: long-form drafts are user-scoped and guarded', async () => {
  const draft = await read('../src/shared/lib/formDraft.ts');
  assert.match(draft, /tadbir:draft:\$\{userId\}:\$\{key\}/, 'draft keys are namespaced per authenticated user');
  assert.match(draft, /localStorage\.removeItem/);
  assert.match(draft, /export function readFormDraft/);
  const guard = await read('../src/shared/ui/DirtyGuardDialog.tsx');
  assert.match(guard, /ذخیره و ادامه/);
  assert.match(guard, /حذف پیش‌نویس/);
  const create = await read('../src/features/projects/CreateProjectModal.tsx');
  assert.match(create, /useFormDraft/);
  assert.match(create, /DirtyGuardDialog/);
  assert.match(create, /مرحلهٔ ۱ از ۲/, 'creation flow is two-step');
  const edit = await read('../src/features/projects/EditProjectModal.tsx');
  assert.match(edit, /useFormDraft/);
  assert.match(edit, /DirtyGuardDialog/);
});

test('ux-02-3-final: content detail header sits on PageSurface with DEC header block', async () => {
  const detail = await read('../src/features/contents/ContentDetailView.tsx');
  assert.match(detail, /<PageSurface className="space-y-5">/);
  assert.match(detail, /aria-label="مسیر صفحه"/, 'breadcrumb at the header start');
  assert.match(detail, /Clock3/, 'owner and update metadata stay visible');
});
