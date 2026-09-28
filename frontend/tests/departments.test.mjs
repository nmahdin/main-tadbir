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
  assert.match(source, /\[departments, setDepartments\] = useState<Department\[\]>\(\[\]\)/);
  assert.match(source, /setDepartments\(departmentData \?\? \[\]\)/);
  assert.match(source, /const response = await departmentsApi\.update\(id, updates\)/);
  assert.doesNotMatch(source, /records: departments|INITIAL_DEPARTMENTS|teamsApi/);
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
});
