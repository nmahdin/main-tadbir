import test from 'node:test';import assert from 'node:assert/strict';
import {safeInternalActionPath,visibleActionScope} from '../src/features/sharedServices/sharedServicesRules.ts';
test('C6 action deep links allow only internal known app roots',()=>{
 assert.equal(safeInternalActionPath('/billing/orders/42'),'/billing/orders/42');
 assert.equal(safeInternalActionPath('/projects/4'),'/projects/4');
 for(const bad of ['javascript:alert(1)','https://evil.example','//evil.test','/unknown/path','/billing/../settings','/billing\\foo'])assert.equal(safeInternalActionPath(bad),null,bad);
});

test('C6 inbox filters personal and organization recipient scope without cross-context leakage',()=>{
 const personal={recipient_scope:'personal',organization_id:null};const orgA={recipient_scope:'organization',organization_id:7};const orgB={recipient_scope:'organization',organization_id:9};
 assert.equal(visibleActionScope(personal,'personal',null),true);
 assert.equal(visibleActionScope(orgA,'personal',null),false);
 assert.equal(visibleActionScope(orgA,'org:7',7),true);
 assert.equal(visibleActionScope(orgB,'org:7',7),false);
 assert.equal(visibleActionScope(personal,'org:7',7),false);
});
