import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C5 operational views route through existing authenticated three-environment shell',()=>{
 const app=read('src/app/App.tsx');
 assert.ok(app.includes("location.pathname.startsWith('/billing/')"));
 assert.ok(app.includes('<CommercialPage />'));
 assert.ok(!app.includes('payment/return'));
 const ui=read('src/features/commercial/CommercialPage.tsx');
 assert.ok(ui.includes('billingAccess(current,payload)'));
 assert.ok(ui.includes("path==='/billing/subscription'"));
});
test('C5 dedicated handoff styles preserve Amendment B/C and mobile layout',()=>{
 const css=read('src/features/commercial/commercial.css');
 for(const key of ['#39677c','border-radius:24px','border-radius:20px','border-radius:16px','border-radius:12px','box-shadow:0 1px 3px rgb(15 23 42 / .035)','@media(max-width:590px)'])assert.ok(css.includes(key),key);
});
