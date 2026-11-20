import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('C6 shared services maintain platform and owner authorization boundaries',()=>{
 const shell=read('src/app/shell/Sidebar.tsx'),page=read('src/features/sharedServices/SharedServicesPage.tsx'),desk=read('src/features/sharedServices/SupportDesk.tsx');
 for(const p of ['platform.messages.manage','platform.support.agent'])assert.ok(page.includes(p),p);
 assert.ok(desk.includes('platform.support.manage'),'manager-only status/reassignment remains separately gated');
 assert.ok(shell.includes('/shared-services/inbox')&&shell.includes('/shared-services/messages')&&shell.includes('/shared-services/support'));
 assert.ok(desk.includes('staff||!m.internal_note'));
 assert.ok(desk.includes('manager&&'));
 assert.ok(desk.includes('newFiles.length>6'));
});
test('C6 reading is separate from explicit, version-specific acknowledgment',()=>{
 const s=read('src/features/sharedServices/SystemMessages.tsx');
 for(const p of ['mark.mutate(m.delivery_id)','acknowledge.mutate(m.delivery_id)','m.version','m.ack_required&&!m.acknowledged_at','window.confirm'])assert.ok(s.includes(p),p);
 assert.ok(!s.includes('dangerouslySetInnerHTML'));
});
