import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PERIODS,convertible,cancellable,owns} from '../src/features/commercial/commercialRules.ts';
import {billingAccess} from '../src/features/commercial/billingAccess.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C5 commercial period and authoritative expiry decision contracts',()=>{
 assert.deepEqual(PERIODS,['monthly','quarterly','annual']);
 assert.equal(convertible({status:'open',remaining_seconds:0}),false);
 assert.equal(convertible({status:'expired',remaining_seconds:90}),false);
 assert.equal(convertible({status:'open',remaining_seconds:1}),true);
 assert.equal(cancellable({status:'in_review',review_remaining_seconds:0}),false);
 assert.equal(owns({organization_id:5,personal_workspace_id:null},{kind:'organization',organizationId:4}),false);
});
test('C5 commercial owner separation cannot elevate platform subscriptions role',()=>{
 const payload={platform:{eligible:true,is_primary:false,permissions:['platform.subscriptions.manage']},organizations:[{id:5,name:'شرکت',slug:'x',status:'active',role:null,permissions:['organization.billing.manage']}],workspaces:[{id:8,name:'کار',organization_id:5}]};
 assert.equal(billingAccess({kind:'platform',id:null},payload).area,'forbidden');
 assert.equal(billingAccess({kind:'organization',id:5},payload).area,'purchase');
 assert.equal(billingAccess({kind:'workspace',id:8},payload).area,'forbidden');
});
test('C5 M2 API calls do not invent PSP or lifecycle',()=>{
 const s=read('src/features/commercial/commercialApi.ts');
 for(const path of ['/billing/catalog','/billing/quotes/personal','/billing/orders/','/platform/billing/plan-versions/','Idempotency-Key'])assert.ok(s.includes(path),path);
 for(const banned of ['payment/start','payment/confirm','proration'])assert.ok(!s.includes(banned));
});
