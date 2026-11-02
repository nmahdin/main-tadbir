import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('showcase mounts isolated Ocean shell preview',()=>{
 const showcase=read('src/features/showcase/UiShowcaseThemeComparison.tsx');
 const preview=read('src/features/showcase/ShellPlayground.tsx');
 assert.ok(showcase.includes('<ShellPlayground />'));
 for(const word of ['ORGANIZATION_NAV','PLATFORM_NAV','aria-expanded','aria-current','drawerOpen','Escape','prefers-reduced-motion']) {
  assert.ok((preview+read('src/features/showcase/shellPlayground.css')).includes(word),word);
 }
 for(const unsafe of ['useApp(', 'useEnvironment(', 'logoutSession(', 'navigate(', 'fetch(']) assert.ok(!preview.includes(unsafe),unsafe);
});
