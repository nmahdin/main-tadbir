import assert from 'node:assert/strict';
import test from 'node:test';
import { canUsePermission } from '../src/utils/permissions.ts';
const role = { id: '1', key: 'admin', isActive: true, permissions: ['tasks.view'] };
test('missing or empty grants never default to allow, including admin display key', () => {
  for (const user of [{}, { status: 'active' }, { status: 'active', role: 'admin' }, { status: 'active', permissions: [] }]) {
    assert.equal(canUsePermission(user, [role], 'tasks.view'), false);
  }
});
test('blocked/pending accounts and inactive roles lose UI grants', () => {
  for (const status of ['blocked', 'inactive', 'pending']) {
    assert.equal(canUsePermission({ status, roleId: '1', permissions: ['tasks.view'] }, [role], 'tasks.view'), false);
  }
  assert.equal(canUsePermission({ status: 'active', roleId: '1' }, [{ ...role, isActive: false }], 'tasks.view'), false);
  assert.equal(canUsePermission({ status: 'active', roleId: '1', roleIsActive: false }, [role], 'tasks.view'), false);
});
test('canonical role id wins over a stale role key and profile fallback is explicit', () => {
  assert.equal(canUsePermission({ status: 'active', roleId: '2', role: 'admin' }, [role], 'tasks.view'), false);
  assert.equal(canUsePermission({ status: 'active', roleId: '1' }, [role], 'tasks.view'), true);
  assert.equal(canUsePermission({ status: 'active', permissions: ['tasks.view'] }, [], 'tasks.view'), true);
  assert.equal(canUsePermission({ status: 'active', permissions: ['tasks.view'] }, [], 'tasks.edit'), false);
});
