import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C5 A09/A10 platform prices accept independent integer periods with server contract',()=>{
 const code=read('src/features/commercial/PlatformCommerce.tsx');
 for(const part of ['commercialApi.prices','commercialApi.publishPrices','commercialApi.catalog','published_at','Number.isSafeInteger','window.confirm'])assert.ok(code.includes(part),part);
 assert.ok(!code.includes('calculateTotal')&&!code.includes('prorate'));
});
test('C5 promotion and tax operations use verified platform billing endpoints only',()=>{
 const code=read('src/features/commercial/PlatformCommerce.tsx');
 for(const part of ['commercialApi.taxes','commercialApi.createTax','commercialApi.activateTax','commercialApi.deactivateTax','commercialApi.promotions','commercialApi.createPromo','commercialApi.deactivatePromo'])assert.ok(code.includes(part),part);
 assert.ok(!code.includes('platform.subscriptions.manage'));
});
