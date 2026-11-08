import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STUDIO_PAGES} from '../src/features/showcase/studio/studioRoutes.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('src/features/showcase/studio/StudioDemoPages.tsx');
const css=read('src/features/showcase/studio/studioPages.css');
test('SPEC-ODL-02 all nine component groups and six foundation routes render real pages',()=>{
 for(const page of STUDIO_PAGES.filter(x=>x.group==='foundations'||x.group==='components'||x.id==='coverage')){
  assert.ok(code.includes("case '"+page.id+"':return <"),'missing '+page.id);
 }
 assert.equal(STUDIO_PAGES.filter(x=>x.group==='components').length,9);
});
test('SPEC-ODL-02 uses existing shared UI rather than parallel production widgets',()=>{
 for(const name of ['Button','Input','Select','DatePicker','Table','Card','Badge','Tabs','Modal','Drawer','Alert','EmptyState','ErrorState','Popover','Tooltip','DropdownMenu']){
  assert.ok(code.includes(name),name);
 }
 for(const forbidden of ['fetch(', 'useQuery(', 'useAuth(', 'localStorage','logoutSession(','setActiveView('])assert.ok(!code.includes(forbidden),forbidden);
});
test('SPEC-ODL-02 proposed 28px radius is Studio-only with exactly Amendment B shadow on hover',()=>{
 assert.ok(css.includes('.ods-radius-panel--current{border-radius:24px}'));
 assert.ok(css.includes('.ods-radius-panel--proposal{border-radius:28px}'));
 assert.ok(css.includes('.ods-radius-panel:hover{box-shadow:var(--shadow-surface'));
 assert.ok(css.includes('.ods-radius-panel--current'));
 const globals=read('src/styles/index.css');
 assert.ok(globals.includes('--radius-content-primary: 24px;'));
 assert.ok(!globals.includes('--radius-content-primary: 28px;'));
 assert.ok(code.includes('data-testid="studio-radius-24"')&&code.includes('data-testid="studio-radius-28"'));
});
test('SPEC-ODL-02 real demo controls provide validation, pagination, error, success and focus primitives',()=>{
 for(const part of ['onSubmit={submit}','onChange={setDate}','role="alert"','type="submit"','disabled','loading','setPage','aria-pressed','role="status"','new Intl.DateTimeFormat'])assert.ok(code.includes(part),part);
});
test('SPEC-ODL-02 coverage is grounded to four official international design sources',()=>{
 assert.ok(code.includes('https://docs.tabler.io/ui/components'));
 assert.ok(code.includes('https://ui.shadcn.com/docs/components/radix/sidebar'));
 assert.ok(code.includes('https://ant.design/components/overview/'));
 assert.ok(code.includes('https://mui.com/material-ui/all-components/'));
 assert.ok(code.includes('STUDIO_COVERAGE'));
});
