import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C5 Stage 3 server-authoritative finance records and plan inventory',()=>{
 const p=read('src/features/commercial/PlatformCommerce.tsx');
 const a=read('src/features/commercial/commercialFlowsApi.ts');
 const r=read('src/features/commercial/CommercialFlows.tsx');
 for(const k of ['commercialFlowsApi.platformPlans','commercialFlowsApi.prices','/billing/platform/findings'])assert.ok(p.includes(k));
 for(const k of ['/platform/billing/plans','/platform/billing/findings','/billing/documents','/billing/payments/'])assert.ok(a.includes(k));
 assert.ok(r.includes('commercialFlowsApi.payment(id)'));
 assert.ok(r.includes('commercialFlowsApi.renderDocument(id)'));
});
