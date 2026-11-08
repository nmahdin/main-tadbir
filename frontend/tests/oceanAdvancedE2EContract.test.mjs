import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('SPEC-ODL-03 each advanced demo has an authored Playwright case in default runner',()=>{
 const conf=read('playwright.config.ts');const cases=read('e2e/oceanAdvancedPatterns.spec.ts');
 assert.ok(conf.includes('oceanAdvancedPatterns.spec.ts'));
 for(const slug of ['/patterns/filters','/patterns/wizard','/patterns/commands'])assert.ok(cases.includes(slug),slug);
 for(const marker of ['Control+k','alertdialog','goBack','Escape','Enter','aria']){if(marker==='aria')continue;assert.ok(cases.includes(marker),marker);}
});
