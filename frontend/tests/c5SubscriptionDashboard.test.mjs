import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {assessUsage} from '../src/features/commercial/resourceStatus.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C5 A01 server-backed resource consumption distinguishes unknown/unlimited/exceeded',()=>{
 assert.equal(assessUsage({resource_key:'projects',limit_value:10,is_unlimited:false,usage:null}),'unknown');
 assert.equal(assessUsage({resource_key:'projects',limit_value:null,is_unlimited:true,usage:40}),'unlimited');
 assert.equal(assessUsage({resource_key:'projects',limit_value:10,is_unlimited:false,usage:11}),'over');
 assert.equal(assessUsage({resource_key:'projects',limit_value:10,is_unlimited:false,usage:10}),'full');
 assert.equal(assessUsage({resource_key:'projects',limit_value:10,is_unlimited:false,usage:9}),'within');
});
test('C5 A01 does not fabricate purchase period or payment status',()=>{
 const s=read('src/features/commercial/SubscriptionPage.tsx');
 for(const k of ['commercialApi.personalSummary','commercialApi.organizationSummary','pending_free_activation','grace_ends_at','is_unlimited','limit_value','usage===null','disabled'])assert.ok(s.includes(k),k);
 for(const bad of ['payment/start','subscription/renew','plan-change-preview'])assert.ok(!s.includes(bad),bad);
});
