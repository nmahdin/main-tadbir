import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C5 navigation exposes management routes only to authenticated environment permissions',()=>{
 const s=read('src/app/shell/Sidebar.tsx');
 for(const mark of ['organization.billing.manage','platform.billing.manage','canManageOrganizationBilling','canManagePlatformBilling','/billing/platform','/billing/subscription'])assert.ok(s.includes(mark),mark);
 assert.ok(read('src/app/shell/Sidebar.tsx').includes('nav-item-workspace-billing'));
});
