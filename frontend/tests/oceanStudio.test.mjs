import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STUDIO_GROUPS,STUDIO_PAGES,resolveStudioPage,studioPath,studioToggleGroup} from '../src/features/showcase/studio/studioRoutes.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('SPEC-ODL-02 every page has a unique directly navigable route and valid group',()=>{
 const paths=STUDIO_PAGES.map(item=>studioPath(item.slug));
 assert.equal(new Set(paths).size,paths.length);
 assert.ok(paths.length>=18);
 assert.equal(studioPath(''),'/theme-previews');
 for(const item of STUDIO_PAGES){
  assert.equal(resolveStudioPage(studioPath(item.slug))?.id,item.id);
  assert.ok(STUDIO_GROUPS.some(g=>g.id===item.group));
 }
 assert.equal(resolveStudioPage('/theme-previews/missing'),null);
 assert.equal(resolveStudioPage('/theme-previews/components/buttons/')?.id,'buttons');
});
test('SPEC-ODL-02 shared shell is above page-specific content and preserves history semantics',()=>{
 const app=read('src/app/App.tsx'),root=read('src/features/showcase/UiShowcaseThemeComparison.tsx');
 const studio=read('src/features/showcase/studio/OceanStudioLayout.tsx');
 assert.ok(app.includes('path="/theme-previews/*"'));
 assert.ok(root.includes('<OceanStudioLayout gallery={<OceanLegacyGallery />} />'));
 assert.ok(root.includes('<UiShowcasePage />'));
 assert.ok(studio.includes('useLocation'));
 assert.ok(studio.includes('to={studioPath(item.slug)}'));
 assert.ok(studio.includes('<RenderPage/>'));
 assert.ok(studio.includes('aria-current'));
 assert.ok(studio.includes('aria-expanded'));
 assert.ok(studio.includes("event.key==='Escape'"));
 assert.ok(studio.includes('sidebar.current.inert=mobile&&!drawerOpen'));
 for(const prohibited of ['useAuth(', 'useApp(', 'logoutSession(', 'setActiveView(', 'localStorage','fetch('])assert.ok(!studio.includes(prohibited),prohibited);
});
test('SPEC-ODL-02 collapsible groups, responsive shell and unchanged approved global tokens',()=>{
 assert.deepEqual(studioToggleGroup(['foundations'],'foundations'),[]);
 assert.deepEqual(studioToggleGroup(['foundations'],'components'),['foundations','components']);
 const css=read('src/features/showcase/studio/studio.css');
 assert.match(css, /@media\(max-width:767px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(css, /overflow-x:clip/);
 const global=read('src/styles/index.css');
 for(const token of ['--radius-content-primary: 24px','--radius-card-standalone: 20px','--radius-panel-nested: var(--radius-lg)','--radius-control: var(--radius-md)'])assert.ok(global.includes(token),token);
});
