import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { departmentDescendants } from '../src/utils/departmentHierarchy.ts';

const departments = [{ id: '3', parentId: '2' }, { id: '1' }, { id: '2', parentId: '1' }, { id: '4', parentId: null }, { id: '5', parentId: '4' }];
test('parent options exclude self and deep descendants but not another branch', () => {
  assert.deepEqual([...departmentDescendants(departments, '1')].sort(), ['1', '2', '3']);
  assert.deepEqual([...departmentDescendants(departments, '2')].sort(), ['2', '3']);
  assert.deepEqual([...departmentDescendants(departments)], []);
});
test('corrupt hierarchy cycles terminate without inventing or inheriting access', () => {
  assert.deepEqual([...departmentDescendants([{ id: '1', parentId: '2' }, { id: '2', parentId: '1' }, { id: '3' }], '1')].sort(), ['1', '2']);
  assert.deepEqual([...departmentDescendants([], 'deleted')], ['deleted']);
});
test('department persistence is API-first and never falls back to cached/sample departments', async () => {
  const source = await readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /\[departments, setDepartments\] = useServerState<Department\[\]>\('departments', \[\]\)/);
  assert.match(source, /if \(departmentData !== null\) setDepartments\(departmentData\)/);
  assert.match(source, /const response = await departmentsApi\.update\(id, updates\)/);
  assert.doesNotMatch(source, /records: departments|INITIAL_DEPARTMENTS|teamsApi/);
});
test('department selectors use the canonical authenticated directory instead of inferred or hardcoded names', async () => {
  const [context, api, thoughtRoom, createIdea, users, auth, createContent] = await Promise.all([
    readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/departments.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/thought-room/ThoughtRoomMainView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/thought-room/CreateIdeaModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/users/UserManagementView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/auth/AuthModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/content/CreateContentModal.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(api, /departments\/directory/);
  assert.match(context, /departmentsApi\.list\(\) : departmentsApi\.directory\(\)/);
  assert.match(thoughtRoom, /departments\.map\(department => <option key=\{department\.id\} value=\{department\.id\}/);
  assert.doesNotMatch(thoughtRoom, /const allDepartments =/);
  assert.match(createIdea, /دپارتمان مرتبط/);
  assert.match(users, /user\.departmentId === selectedDepartment/);
  assert.doesNotMatch(users, /Departments list from users/);
  assert.doesNotMatch(auth, /دپارتمان مهندسی نرم‌افزار|regDepartment/);
  assert.match(createContent, /fallbackId = departments\.find/);
});

test('the direct department screen replaces team/stats wrapper and sidebar logout only', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const sidebar = await readFile(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
  const view = await readFile(new URL('../src/components/departments/DepartmentsView.tsx', import.meta.url), 'utf8');
  assert.match(app, /<DepartmentsView/);
  assert.doesNotMatch(app, /TeamsView|CreateTeamModal/);
  assert.match(sidebar, /id: 'departments'/);
  assert.doesNotMatch(sidebar, /sidebar-logout-btn|id: 'teams'|\blogout\b/);
  assert.doesNotMatch(view, /StatCard|TeamsView|teams\.filter/);
  assert.match(view, /ModuleErrorBanner modules=\{\['departments'\]\}/);
  assert.doesNotMatch(view, /ModuleErrorBanner module=/);
});
