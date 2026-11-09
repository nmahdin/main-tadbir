import React,{useState} from 'react';
import {Activity,CalendarDays,Check,ChevronDown,ChevronUp,GripVertical,LayoutDashboard,ListTodo,RotateCcw,Settings2,TrendingUp,X,type LucideIcon} from 'lucide-react';
import {LAB_WIDTHS,type LabDevice} from './shellState';
import {DEFAULT_WIDGETS,WIDGET_CATALOG,cloneLayout,moveWidget,moveWidgetBefore,normalizeLayout,resizeWidget,setWidgetVisible,spanForDevice,validateLayout,type WidgetId,type WidgetPlacement,type WidgetSpan} from './layoutModel';
const ICONS:Record<WidgetId,LucideIcon>={projects:LayoutDashboard,tasks:ListTodo,calendar:CalendarDays,activity:Activity,insights:TrendingUp};
const VALUES:Record<WidgetId,string>={projects:'۱۲',tasks:'۲۸',calendar:'۳',activity:'۷',insights:'٪۸۴'};
function MockWidget({id}:{id:WidgetId}){
 if(id==='insights')return <div className="odl-layout-bars" aria-label="نمودار نمایشی">
   {[50,68,48,82,62,89,74].map((value,i)=><span key={i} style={{height:String(value)+'%'}} />)}
 </div>;
 if(id==='activity')return <ul className="odl-layout-feed"><li>یک کار نمونه به‌روزرسانی شد.</li><li>یک پروژهٔ فرضی ایجاد شد.</li><li>گزارش آزمایشی آماده است.</li></ul>;
 if(id==='calendar')return <div className="odl-layout-days">{['ش','ی','د','س','چ','پ','ج'].map((day,i)=><span key={i}>{day}</span>)}</div>;
 return <div className="odl-layout-value">{VALUES[id]}<small>{id==='tasks'?'وظیفهٔ آزمایشی':'پروژهٔ نمونه'}</small></div>;
}
export function LayoutEditorPrototype(){
 const [device,setDevice]=useState<LabDevice>(1440);
 const [committed,setCommitted]=useState<WidgetPlacement[]>(cloneLayout(DEFAULT_WIDGETS));
 const [draft,setDraft]=useState<WidgetPlacement[]>(cloneLayout(DEFAULT_WIDGETS));
 const [editing,setEditing]=useState(false);
 const [dragging,setDragging]=useState<WidgetId|null>(null);
 const [message,setMessage]=useState('چیدمان نمونه در حافظهٔ موقت این صفحه نگهداری می‌شود.');
 const [error,setError]=useState('');
 const items=editing?draft:committed;
 const visible=items.filter(x=>x.visible);
 const hidden=items.filter(x=>!x.visible);
 const update=(next:WidgetPlacement[])=>{setDraft(normalizeLayout(next));setError('');setMessage('تغییر ذخیره‌نشده در پیش‌نمایش.');};
 function begin(){setDraft(cloneLayout(committed));setEditing(true);setError('');setMessage('حالت ویرایش فعال است؛ جابه‌جایی با دکمه‌ها یا کشیدن کارت‌ها امکان‌پذیر است.');}
 function save(){
  if(!validateLayout(draft)){setError('چیدمان معتبر نیست؛ حداقل یک ابزارک باید قابل نمایش باشد.');return;}
  setCommitted(cloneLayout(draft));setEditing(false);setError('');setMessage('چیدمان فقط در حافظهٔ موقت این صفحه ذخیره شد.');
 }
 function cancel(){setDraft(cloneLayout(committed));setEditing(false);setError('');setDragging(null);setMessage('تغییرات ذخیره‌نشده لغو شد.');}
 function reset(){
  const defaults=cloneLayout(DEFAULT_WIDGETS);
  if(editing)setDraft(defaults);else{setCommitted(defaults);setDraft(defaults);}
  setError('');setMessage(editing?'پیش‌نویس به چیدمان اولیه برگشت؛ برای ثبت، ذخیره را انتخاب کنید.':'چیدمان نمونه به حالت اولیه بازگشت.');
 }
 function changeSpan(id:WidgetId,span:WidgetSpan){update(resizeWidget(draft,id,span));}
 return <section className="odl-layout-editor" aria-label="ویرایشگر آزمایشی چیدمان">
  <div className="odl-layout-toolbar">
   <div><h3>چیدمان دلخواه داشبورد</h3><p>ابزارک‌های مجاز و ساختگی؛ بدون ذخیره در حساب کاربری یا سرور.</p></div>
   <div role="group" aria-label="عرض ویرایشگر" className="odl-width-controls">
    {LAB_WIDTHS.map(width=><button key={width} aria-pressed={device===width} onClick={()=>setDevice(width)}>{width}px</button>)}
   </div>
   <div className="odl-layout-actions">
    {!editing?<button className="odl-layout-primary" onClick={begin}><Settings2 size={16}/> ویرایش چیدمان</button>:
      <><button className="odl-layout-primary" onClick={save}><Check size={16}/> ذخیرهٔ موقت</button>
       <button onClick={cancel}><X size={16}/> لغو تغییرات</button></>}
    <button onClick={reset}><RotateCcw size={16}/> بازنشانی</button>
   </div>
  </div>
  {editing&&<div className="odl-layout-visibility" aria-label="نمایش یا مخفی کردن ابزارک‌ها">
   <strong>ابزارک‌های قابل نمایش</strong><div>
    {WIDGET_CATALOG.map(meta=><label key={meta.id}><input type="checkbox" checked={Boolean(draft.find(x=>x.id===meta.id)?.visible)}
     onChange={event=>update(setWidgetVisible(draft,meta.id,event.target.checked))}/>{meta.title}</label>)}
   </div>
  </div>}
  <div className="odl-layout-scroll"><div className="odl-layout-canvas" data-device={device} style={{width:device}}>
   <div className="odl-layout-canvas-heading"><div><small>OCEAN DASHBOARD / MOCK</small><h4>پیشخوان قابل چیدمان</h4></div>
    <span>{editing?'در حال ویرایش':'نمایش چیدمان'}</span></div>
   <div className="odl-layout-grid" data-testid="layout-grid">
    {visible.map((item,index)=>{
     const meta=WIDGET_CATALOG.find(x=>x.id===item.id)!;
     const Icon=ICONS[item.id];return <article key={item.id} className="odl-layout-widget ui-standalone-card"
      data-elevation="standalone" data-widget-id={item.id}
      style={{gridColumn:'span '+spanForDevice(item.span,device)}}
      draggable={editing&&device!==390}
      onDragStart={event=>{if(!editing)return;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);setDragging(item.id);}}
      onDragOver={event=>{if(editing&&dragging)event.preventDefault();}}
      onDrop={event=>{event.preventDefault();if(editing&&dragging)update(moveWidgetBefore(draft,dragging,item.id));setDragging(null);}}
      onDragEnd={()=>setDragging(null)}>
      <header><span className="odl-layout-widget-icon"><Icon size={19} aria-hidden/></span><div><h5>{meta.title}</h5><small>{meta.description}</small></div>
       {editing&&device!==390&&<GripVertical size={17} className="odl-drag-hint" aria-hidden/>}</header>
      <MockWidget id={item.id}/>
      {editing&&<footer aria-label={'ویرایش '+meta.title}>
       <button aria-label={'انتقال '+meta.title+' به بالا'} disabled={index===0} onClick={()=>update(moveWidget(draft,item.id,'up'))}><ChevronUp size={16}/></button>
       <button aria-label={'انتقال '+meta.title+' به پایین'} disabled={index===visible.length-1} onClick={()=>update(moveWidget(draft,item.id,'down'))}><ChevronDown size={16}/></button>
       <button aria-label={'کم‌کردن عرض '+meta.title} disabled={item.span===1} onClick={()=>changeSpan(item.id,1)}>۱ ستون</button>
       <button aria-label={'افزایش عرض '+meta.title} disabled={item.span===2||device===390} onClick={()=>changeSpan(item.id,2)}>۲ ستون</button>
       <button aria-label={'مخفی‌کردن '+meta.title} onClick={()=>update(setWidgetVisible(draft,item.id,false))}>مخفی</button>
      </footer>}
     </article>;
    })}
   </div>
   {visible.length===0&&<div className="odl-layout-empty" role="status"><LayoutDashboard size={27}/><h5>ابزارکی برای نمایش نمانده است.</h5>
    <p>برای ادامه دست‌کم یک ابزارک را از فهرست نمایش فعال کنید.</p>
    {editing&&<button onClick={reset}>بازگردانی پیش‌نویس اولیه</button>}</div>}
   {editing&&hidden.length>0&&<div className="odl-layout-hidden"><strong>ابزارک‌های پنهان</strong><p>{hidden.map(x=>WIDGET_CATALOG.find(y=>y.id===x.id)?.title).join('، ')}</p></div>}
   </div></div>
  {error&&<p role="alert" className="odl-layout-error">{error}</p>}
  <p role="status" className="odl-status">{message}</p>
  <p className="odl-layout-note">در موبایل همهٔ ابزارک‌ها تک‌ستونی نمایش داده می‌شوند؛ عرض اصلی هر ابزارک برای دسکتاپ حفظ می‌شود. ترتیب هیچ‌گاه جایگاه هم‌پوشان ایجاد نمی‌کند.</p>
 </section>;
}
