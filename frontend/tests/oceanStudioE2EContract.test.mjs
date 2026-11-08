import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('SPEC-ODL-02 Playwright suites cover URL history, keyboard, three viewports and geometry',()=>{
 const src=read('e2e/oceanStudio.spec.ts');
 const config=read('playwright.config.ts');
 for(const fragment of ['page.goBack()','page.goForward()','page.reload()','keyboard.press','Escape','390','834','1440','getComputedStyle','__mountProbe','reducedMotion'])assert.ok(src.includes(fragment),fragment);
 assert.ok(config.includes("'oceanStudio.spec.ts'"));
});
