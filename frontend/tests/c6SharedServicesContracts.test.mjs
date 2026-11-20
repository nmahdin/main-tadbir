import test from 'node:test';import assert from 'node:assert/strict';
import {safeInternalActionPath} from '../src/features/sharedServices/sharedServicesRules.ts';
test('C6 action deep links allow only internal known app roots',()=>{
 assert.equal(safeInternalActionPath('/billing/orders/42'),'/billing/orders/42');
 assert.equal(safeInternalActionPath('/projects/4'),'/projects/4');
 for(const bad of ['javascript:alert(1)','https://evil.example','//evil.test','/unknown/path','/billing/../settings','/billing\\foo'])assert.equal(safeInternalActionPath(bad),null,bad);
});
