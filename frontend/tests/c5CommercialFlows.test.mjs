import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C5 A02/A03 catalog shows only published periods and server amounts',()=>{
 const s=read('src/features/commercial/CommercialCatalog.tsx');
 for(const k of ['commercialApi.catalog','entry.prices[period]','disabled={!entry.prices[period]','commercialApi.createQuote','plan.audience===scope.kind','crypto.randomUUID()'])assert.ok(s.includes(k),k);
 assert.ok(!s.includes('amount_toman * 3')&&!s.includes('amount_toman * 12'));
});
test('C5 A04/A05 owner-scoped records, expiry, idempotency, conflicts, no payment CTA',()=>{
 const s=read('src/features/commercial/CommercialRecords.tsx');
 for(const k of ['commercialApi.quote','commercialApi.convertQuote','commercialApi.orders','commercialApi.order','commercialApi.cancelOrder','owns(quote,scope)','owns(order,scope)','useRemaining','MoneyBreakdown'])assert.ok(s.includes(k),k);
 assert.ok(s.includes('window.confirm("با ثبت سفارش'), 'quote conversion must confirm the owner intent');
 for(const unsafe of ['payment/start','payment/success','payment/verify'])assert.ok(!s.includes(unsafe));
});
