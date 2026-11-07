export const WIDGET_CATALOG=[
 {id:'projects',title:'وضعیت پروژه‌ها',description:'مرور تعداد و روند پروژه‌های نمونه'},
 {id:'tasks',title:'وظایف من',description:'نمایش وضعیت وظایف آزمایشی'},
 {id:'calendar',title:'تقویم این هفته',description:'رویدادهای ساختگی هفته'},
 {id:'activity',title:'آخرین فعالیت‌ها',description:'فعالیت‌های فرضی اعضا'},
 {id:'insights',title:'روند عملکرد',description:'نمایش تصویری داده‌های نمایشی'},
] as const;
export type WidgetId=(typeof WIDGET_CATALOG)[number]['id'];
export type WidgetSpan=1|2;
export type WidgetPlacement={id:WidgetId;span:WidgetSpan;visible:boolean};
export type MoveDirection='up'|'down';
export const DEFAULT_WIDGETS:WidgetPlacement[]=[
 {id:'projects',span:1,visible:true},
 {id:'tasks',span:1,visible:true},
 {id:'calendar',span:1,visible:true},
 {id:'activity',span:2,visible:true},
 {id:'insights',span:1,visible:true},
];
const isId=(id:string):id is WidgetId=>WIDGET_CATALOG.some(item=>item.id===id);
export const cloneLayout=(value:readonly WidgetPlacement[]):WidgetPlacement[]=>value.map(x=>({...x}));
export function normalizeLayout(value:readonly WidgetPlacement[]):WidgetPlacement[]{
 const valid:WidgetPlacement[]=[],seen=new Set<WidgetId>();
 for(const item of value){
  if(!isId(item.id)||seen.has(item.id))continue;
  seen.add(item.id);valid.push({id:item.id,span:item.span===2?2:1,visible:item.visible===true});
 }
 for(const item of DEFAULT_WIDGETS)if(!seen.has(item.id))valid.push({...item});
 return valid;
}
export function validateLayout(value:readonly WidgetPlacement[]):boolean{
 return value.length===WIDGET_CATALOG.length&&new Set(value.map(x=>x.id)).size===value.length&&
  value.every(x=>isId(x.id)&&(x.span===1||x.span===2)&&typeof x.visible==='boolean')&&
  value.some(x=>x.visible);
}
export function moveWidget(value:readonly WidgetPlacement[],id:WidgetId,direction:MoveDirection):WidgetPlacement[]{
 const next=cloneLayout(value),from=next.findIndex(x=>x.id===id),to=from+(direction==='up'?-1:1);
 if(from<0||to<0||to>=next.length)return next;
 const item=next[from];next[from]=next[to];next[to]=item;return next;
}
export function moveWidgetBefore(value:readonly WidgetPlacement[],source:WidgetId,target:WidgetId):WidgetPlacement[]{
 if(source===target||!value.some(x=>x.id===source)||!value.some(x=>x.id===target))return cloneLayout(value);
 const next=cloneLayout(value),index=next.findIndex(x=>x.id===source),item=next.splice(index,1)[0];
 next.splice(next.findIndex(x=>x.id===target),0,item);return next;
}
export function resizeWidget(value:readonly WidgetPlacement[],id:WidgetId,span:WidgetSpan):WidgetPlacement[]{
 return value.map(x=>x.id===id?{...x,span:span===2?2:1}:({...x}));
}
export function setWidgetVisible(value:readonly WidgetPlacement[],id:WidgetId,visible:boolean):WidgetPlacement[]{
 return value.map(x=>x.id===id?{...x,visible}:({...x}));
}
export function spanForDevice(span:WidgetSpan,width:1440|834|390):WidgetSpan{return width===390?1:span;}
