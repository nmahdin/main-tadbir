import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {FIELDS,ROWS,EMPTY_FILTER,makeGroup,parseFilter,validFilter,normalizePersian,matchRows} from '../src/features/showcase/studio/advanced/filterModel.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('ODL-03 A Persian normalizer handles Arabic letters and mixed digits',()=>{assert.equal(normalizePersian(' علي كريمي ۱۲٣ '),'علی کریمی 123');});
test('ODL-03 A typed filter validation rejects unknown fields/operators and version',()=>{
 const g=makeGroup('g1');const q={v:1,join:'and',groups:[g]};
 assert.equal(validFilter(q),true);assert.deepEqual(parseFilter(JSON.stringify(q)),q);
 assert.equal(validFilter({...q,groups:[{...g,conditions:[{...g.conditions[0],field:'unknown'}]}]}),false);
 assert.equal(validFilter({...q,groups:[{...g,conditions:[{...g.conditions[0],field:'status',op:'contains'}]}]}),false);
 assert.deepEqual(parseFilter('not json'),EMPTY_FILTER);assert.equal(FIELDS.length,4);
});
test('ODL-03 A two-level AND/OR groups evaluate mock data',()=>{
 const q={v:1,join:'or',groups:[
 {id:'g1',join:'and',conditions:[{id:'c1',field:'owner',op:'contains',value:'سارا'},{id:'c2',field:'priority',op:'equals',value:'بالا'}]},
 {id:'g2',join:'and',conditions:[{id:'c3',field:'status',op:'equals',value:'تکمیل'}]}]};
 assert.deepEqual(matchRows(ROWS,q).map(x=>x.id),['TD-001','TD-003','TD-006']);
 assert.equal(matchRows(ROWS,EMPTY_FILTER).length,ROWS.length);
});
test('ODL-03 A route and frontend-only URL draft/apply/reset semantics',()=>{
 const ui=read('src/features/showcase/studio/advanced/AdvancedFiltersPage.tsx');
 assert.ok(read('src/features/showcase/studio/studioRoutes.ts').includes('patterns/filters'));
 for(const s of ['useSearchParams','setParams(next)','parseFilter(raw)','role="status"','<fieldset'])assert.ok(ui.includes(s),s);
 for(const bad of ['fetch(', 'localStorage','useAuth(','dangerouslySetInnerHTML'])assert.ok(!ui.includes(bad),bad);
});
