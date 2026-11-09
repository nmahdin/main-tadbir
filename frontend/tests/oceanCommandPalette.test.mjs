import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {MOCK_COMMANDS,getCommands,commandDestination,moveCommandIndex} from '../src/features/showcase/studio/advanced/commandModel.ts';
import {STUDIO_PAGES} from '../src/features/showcase/studio/studioRoutes.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('ODL-03 C mock permission rules hide unavailable commands and resolve only Studio pages',()=>{
 assert.ok(getCommands('organization','').length>getCommands('workspace','').length);
 assert.ok(getCommands('workspace','').every(x=>x.allowed.includes('workspace')));
 for(const command of MOCK_COMMANDS)assert.ok(STUDIO_PAGES.some(x=>x.id===command.pageId));
 const filters=MOCK_COMMANDS.find(x=>x.id==='filters');assert.ok(filters);
 assert.equal(commandDestination(filters,'workspace'),null);
 assert.equal(commandDestination(filters,'platform'),'/theme-previews/patterns/filters');
});
test('ODL-03 C Persian normalization, empty results and cyclic arrow index',()=>{
 assert.equal(getCommands('platform','دكمه').some(x=>x.id==='buttons'),true);
 assert.deepEqual(getCommands('workspace','there-is-no-result'),[]);
 assert.equal(moveCommandIndex(0,'up',3),2);assert.equal(moveCommandIndex(2,'down',3),0);
 assert.equal(moveCommandIndex(0,'down',0),-1);
});
test('ODL-03 C key binding, escape, focus trap and no production/global activation',()=>{
 const src=read('src/features/showcase/studio/advanced/CommandPalettePage.tsx');
 assert.ok(read('src/features/showcase/studio/studioRoutes.ts').includes('patterns/commands'));
 for(const marker of ["e.ctrlKey||e.metaKey","e.key==='Escape'","e.key==='ArrowDown'","e.key==='Tab'","aria-modal=\"true\"","createPortal","studio.inert=true","opener.current?.focus()","getCommands","commandDestination"])assert.ok(src.includes(marker),marker);
 for(const bad of ["fetch(","localStorage","useAuth(","dangerouslySetInnerHTML"])assert.ok(!src.includes(bad),bad);
});
