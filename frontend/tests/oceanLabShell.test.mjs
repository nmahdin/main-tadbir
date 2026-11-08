import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LAB_ENVS,LAB_WIDTHS,defaultCollapsed,mobileDrawer,toggleGroup,ensureActive} from '../src/features/showcase/lab/shellState.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('FE-ODL-01 environment switching and frame defaults',()=>{
 assert.deepEqual(LAB_ENVS.map(x=>x.value),['workspace','organization','platform']);
 assert.deepEqual(LAB_WIDTHS,[1440,834,390]);
 assert.equal(mobileDrawer(390),true);assert.equal(mobileDrawer(834),false);
 assert.equal(defaultCollapsed(834),true);
});
test('FE-ODL-01 group toggling and stable active item',()=>{
 assert.deepEqual(toggleGroup(['daily'],'daily'),[]);
 assert.deepEqual(toggleGroup(['daily'],'planning'),['daily','planning']);
 assert.equal(ensureActive(['one','two'],'missing'),'one');
 assert.equal(ensureActive(['one','two'],'two'),'two');
});
test('FE-ODL-01 demo is isolated from production shell and focus management is present',()=>{
 const lab=read('src/features/showcase/UiShowcaseThemeComparison.tsx');
 const shell=read('src/features/showcase/lab/OceanShellPlayground.tsx');
 const css=read('src/features/showcase/lab/oceanLab.css');
 assert.ok(lab.includes('<OceanStudioLayout gallery={<OceanLegacyGallery />} />'));
 for(const part of ['ORGANIZATION_NAV','PLATFORM_NAV','aria-expanded','aria-current','Escape','data-tour-id','role="status"',"addEventListener('keydown'",'setDrawerOpen'])assert.ok(shell.includes(part),part);
 for(const forbidden of ['useApp(', 'useAuth(', 'useEnvironment(', 'logoutSession(', 'navigate(', 'fetch(', 'localStorage'])assert.ok(!shell.includes(forbidden),forbidden);
 assert.ok(css.includes('container-type:inline-size'));
 assert.ok(css.includes('@container odl-shell-frame (max-width:600px)'));
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
});
