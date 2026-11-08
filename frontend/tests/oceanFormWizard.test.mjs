import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {WIZARD_DEFAULT,WIZARD_STEPS,wizardErrors,canAdvance,wizardProgress,isWizardDirty,safeStep} from '../src/features/showcase/studio/advanced/wizardModel.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('ODL-03 B per-step validation covers required title, email and description',()=>{
 assert.equal(canAdvance(WIZARD_DEFAULT,0),false);
 assert.ok(wizardErrors(WIZARD_DEFAULT,0).title);
 const details={title:'نمونهٔ معتبر',category:'technical',contact:'bad',description:'کوتاه'};
 assert.equal(canAdvance(details,0),true);assert.equal(canAdvance(details,1),false);
 assert.ok(wizardErrors(details,1).contact);
 assert.equal(canAdvance({...details,contact:'demo@example.com',description:'توضیح درخواست نمونه برای بررسی'},1),true);
});
test('ODL-03 B progress, bounds and dirty-state contracts are deterministic',()=>{
 assert.equal(WIZARD_STEPS.length,4);assert.equal(wizardProgress(0),0);assert.equal(wizardProgress(3),100);
 assert.equal(safeStep(9),3);assert.equal(safeStep(-2),0);assert.equal(isWizardDirty(WIZARD_DEFAULT),false);
 assert.equal(isWizardDirty({...WIZARD_DEFAULT,title:'تغییر'}),true);
});
test('ODL-03 B route preserves mock-only review, confirmation and warnings',()=>{
 const ui=read('src/features/showcase/studio/advanced/FormWizardPage.tsx');
 const route=read('src/features/showcase/studio/studioRoutes.ts');
 assert.ok(route.includes("'patterns/wizard'"));
 for(const s of ["beforeunload","aria-current","role=\"progressbar\"","role=\"alert\"","role=\"alertdialog\"","aria-modal=\"true\"","wizardErrors","step===2","step===3"])assert.ok(ui.includes(s),s);
 for(const bad of ["fetch(","localStorage","useAuth(","dangerouslySetInnerHTML"])assert.ok(!ui.includes(bad),bad);
});
