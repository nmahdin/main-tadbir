import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TOUR_MANIFESTS,tourReducer,validateTourManifest,missingTarget} from '../src/features/showcase/lab/tourModel.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('FE-UX-TOUR-01 environment manifests are separate and versioned',()=>{
 assert.deepEqual(Object.keys(TOUR_MANIFESTS),['workspace','organization','platform']);
 for(const m of Object.values(TOUR_MANIFESTS)){assert.equal(validateTourManifest(m),true);assert.equal(m.steps.length,4);}
 assert.equal(validateTourManifest({...TOUR_MANIFESTS.workspace,version:'0-invalid'}),false);
 assert.equal(validateTourManifest({...TOUR_MANIFESTS.workspace,steps:[TOUR_MANIFESTS.workspace.steps[0],TOUR_MANIFESTS.workspace.steps[0]]}),false);
});
test('FE-UX-TOUR-01 welcome/next/back/skip/replay/finish state machine',()=>{
 const idle={phase:'idle',index:0,version:'1.0.0'};
 const welcome=tourReducer(idle,{type:'WELCOME'});assert.equal(welcome.phase,'welcome');
 const started=tourReducer(welcome,{type:'START'});assert.equal(started.phase,'active');
 const second=tourReducer(started,{type:'NEXT',total:4});assert.equal(second.index,1);
 assert.equal(tourReducer(second,{type:'BACK'}).index,0);
 const finished=tourReducer({...second,index:3},{type:'NEXT',total:4});assert.equal(finished.phase,'finished');
 assert.equal(tourReducer(finished,{type:'REPLAY'}).phase,'welcome');
 assert.equal(tourReducer(started,{type:'SKIP'}).phase,'skipped');
 assert.deepEqual(tourReducer(started,{type:'RESET',version:'2.0.0'}),{phase:'idle',index:0,version:'2.0.0'});
});
test('FE-UX-TOUR-01 missing targets are harmless and overlays remain mock/accessible',()=>{
 assert.equal(missingTarget(['demo-dashboard'],'demo-navigation'),true);
 assert.equal(missingTarget(['demo-dashboard'],'demo-dashboard'),false);
 const source=read('src/features/showcase/lab/GuidedTourPrototype.tsx');
 const host=read('src/features/showcase/lab/OceanDesignLab.tsx');
 for(const part of ['role="dialog"','aria-modal="true"','Escape','data-tour-id','getBoundingClientRect','TourSpotlight','TourStepPopover','hideControls','anchor={anchor}'])assert.ok(source.includes(part),part);
 assert.ok(host.includes('lab=tour'));
 for(const prohibited of ['localStorage','fetch(', 'useQuery(', 'logoutSession(', 'setActiveView('])assert.ok(!source.includes(prohibited),prohibited);
});
