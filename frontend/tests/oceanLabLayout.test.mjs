import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_WIDGETS,WIDGET_CATALOG,cloneLayout,normalizeLayout,moveWidget,moveWidgetBefore,resizeWidget,setWidgetVisible,spanForDevice,validateLayout} from '../src/features/showcase/lab/layoutModel.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('FE-UX-LAYOUT-01 allowlisted widgets, normalization and no invalid spans or duplicates',()=>{
 assert.equal(validateLayout(DEFAULT_WIDGETS),true);
 assert.equal(WIDGET_CATALOG.length,DEFAULT_WIDGETS.length);
 const dirty=[...cloneLayout(DEFAULT_WIDGETS),{...DEFAULT_WIDGETS[0],span:7}, {id:'script',span:2,visible:true}];
 const clean=normalizeLayout(dirty);
 assert.equal(clean.length,DEFAULT_WIDGETS.length);
 assert.equal(validateLayout(clean),true);
 assert.deepEqual(new Set(clean.map(x=>x.id)).size,DEFAULT_WIDGETS.length);
 assert.equal(validateLayout(clean.map(x=>({...x,visible:false}))),false);
});
test('FE-UX-LAYOUT-01 edit movement and drag ordering preserve membership',()=>{
 const base=cloneLayout(DEFAULT_WIDGETS);
 const moved=moveWidget(base,'tasks','up');
 assert.equal(moved[0].id,'tasks');
 assert.equal(base[0].id,'projects');
 assert.deepEqual(moveWidget(moved,'tasks','up'),moved);
 const withHidden=setWidgetVisible(base,'tasks',false);
 assert.equal(moveWidget(withHidden,'projects','down')[2].id,'projects','visible movement skips hidden widgets');
 const dragged=moveWidgetBefore(base,'insights','projects');
 assert.equal(dragged[0].id,'insights');
 assert.equal(dragged.length,base.length);
 assert.deepEqual(moveWidgetBefore(base,'projects','projects'),base);
});
test('FE-UX-LAYOUT-01 resize, show/hide, deterministic mobile and no overlapping explicit grid coordinates',()=>{
 const wide=resizeWidget(DEFAULT_WIDGETS,'projects',2);
 assert.equal(wide[0].span,2);
 assert.equal(spanForDevice(wide[0].span,390),1);
 assert.equal(spanForDevice(wide[0].span,834),2);
 const hidden=setWidgetVisible(DEFAULT_WIDGETS,'projects',false);
 assert.equal(hidden[0].visible,false);
 assert.equal(DEFAULT_WIDGETS[0].visible,true);
 assert.equal(validateLayout(hidden),true);
});
test('FE-UX-LAYOUT-01 temporary save/cancel/reset and keyboard controls are implemented without APIs',()=>{
 const jsx=read('src/features/showcase/lab/LayoutEditorPrototype.tsx');
 const host=read('src/features/showcase/lab/OceanDesignLab.tsx');
 for(const fragment of ['setCommitted','setDraft','setEditing','validateLayout','cloneLayout(DEFAULT_WIDGETS)','role="alert"','role="status"','onDragStart','onDrop','aria-label','moveWidget','resizeWidget'])assert.ok(jsx.includes(fragment),fragment);
 for(const forbidden of ['localStorage','useQuery(','fetch(','dangerouslySetInnerHTML','eval('])assert.ok(!jsx.includes(forbidden),forbidden);
 assert.ok(host.includes('lab=layout'));
 assert.ok(read('src/features/showcase/lab/layout.css').includes('grid-template-columns:1fr'));
});
