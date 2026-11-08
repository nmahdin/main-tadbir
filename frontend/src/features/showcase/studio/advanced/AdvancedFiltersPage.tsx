import React,{useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Button,Card,Badge,EmptyState} from '../../../../shared/ui/Primitives';
import {FIELDS,OPERATORS,ROWS,EMPTY_FILTER,makeGroup,parseFilter,validFilter,matchRows,type Filter,type Group,type Condition,type Field,type Operator,type Join} from './filterModel';
let seq=1;const id=(prefix:string)=>prefix+'-'+seq++;
export function AdvancedFiltersPage(){
 const [params,setParams]=useSearchParams(),raw=params.get('filter');
 const [draft,setDraft]=useState<Filter>(()=>parseFilter(raw)),[message,setMessage]=useState('');
 const applied=parseFilter(raw),previous=useRef(raw);
 useEffect(()=>{if(raw!==previous.current){setDraft(parseFilter(raw));previous.current=raw;}},[raw]);
 const updateGroup=(key:string,fn:(g:Group)=>Group)=>setDraft(s=>({...s,groups:s.groups.map(g=>g.id===key?fn(g):g)}));
 const changeCondition=(group:string,key:string,fn:(c:Condition)=>Condition)=>updateGroup(group,g=>({...g,conditions:g.conditions.map(c=>c.id===key?fn(c):c)}));
 function apply(){if(!validFilter(draft)){setMessage('فیلتر معتبر نیست.');return;}
  const next=new URLSearchParams(params);if(draft.groups.length)next.set('filter',JSON.stringify(draft));else next.delete('filter');
  previous.current=next.get('filter');setParams(next);setMessage('فیلتر آزمایشی اعمال شد و نشانی صفحه به‌روز شد.');}
 function clear(){const next=new URLSearchParams(params);next.delete('filter');previous.current=null;setDraft(EMPTY_FILTER);setParams(next);setMessage('فیلترها پاک شدند.');}
 const results=matchRows(ROWS,applied);
 return <div className="ods-patterns" dir="rtl"><Card title="سازندهٔ فیلترهای پیشرفته" description="فقط داده‌های ساختگی؛ AND/OR بین گروه‌ها و شرط‌ها.">
  <div className="ods-pattern-bar"><label>ارتباط گروه‌ها<select aria-label="ارتباط میان گروه‌ها" value={draft.join} onChange={e=>setDraft({...draft,join:e.target.value as Join})}><option value="and">AND / همه</option><option value="or">OR / یکی</option></select></label>
   <Button variant="secondary" disabled={draft.groups.length>=4} onClick={()=>setDraft({...draft,groups:[...draft.groups,makeGroup(id('g'))]})}>افزودن گروه</Button></div>
  {!draft.groups.length&&<p className="ods-pattern-hint">هیچ شرطی انتخاب نشده؛ همهٔ نتایج نمایش داده می‌شوند.</p>}
  {draft.groups.map((g,n)=><fieldset key={g.id} className="ods-pattern-group"><legend>گروه {n+1}</legend>
   <div className="ods-pattern-bar"><label>ارتباط شرط‌ها<select aria-label={'ارتباط شرط‌های گروه '+(n+1)} value={g.join} onChange={e=>updateGroup(g.id,x=>({...x,join:e.target.value as Join}))}><option value="and">AND / همه</option><option value="or">OR / یکی</option></select></label>
    <Button variant="secondary" onClick={()=>setDraft({...draft,groups:draft.groups.filter(x=>x.id!==g.id)})}>حذف گروه</Button></div>
   {g.conditions.map((c,i)=><div key={c.id} className="ods-pattern-condition">
    <label>فیلد<select aria-label={'فیلد شرط '+(i+1)+' در گروه '+(n+1)} value={c.field} onChange={e=>{
     const field=e.target.value as Field;changeCondition(g.id,c.id,x=>({...x,field,op:FIELDS.find(y=>y.id===field)!.operators[0],value:''}));}}>
     {FIELDS.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
    <label>عملگر<select aria-label={'عملگر شرط '+(i+1)+' در گروه '+(n+1)} value={c.op} onChange={e=>changeCondition(g.id,c.id,x=>({...x,op:e.target.value as Operator}))}>
     {FIELDS.find(f=>f.id===c.field)!.operators.map(op=><option key={op} value={op}>{OPERATORS[op]}</option>)}</select></label>
    <label>مقدار{FIELDS.find(f=>f.id===c.field)?.options?
     <select aria-label={'مقدار شرط '+(i+1)+' در گروه '+(n+1)} value={c.value} onChange={e=>changeCondition(g.id,c.id,x=>({...x,value:e.target.value}))}>
      <option value="">همه</option>{FIELDS.find(f=>f.id===c.field)!.options!.map(v=><option key={v}>{v}</option>)}</select>:
     <input aria-label={'مقدار شرط '+(i+1)+' در گروه '+(n+1)} value={c.value} maxLength={100} placeholder="عبارت نمونه" onChange={e=>changeCondition(g.id,c.id,x=>({...x,value:e.target.value}))}/>}</label>
    <button type="button" disabled={g.conditions.length===1} onClick={()=>updateGroup(g.id,x=>({...x,conditions:x.conditions.filter(y=>y.id!==c.id)}))}>حذف شرط</button>
   </div>)}
   <Button variant="secondary" disabled={g.conditions.length>=5} onClick={()=>updateGroup(g.id,x=>({...x,conditions:[...x.conditions,{id:id('c'),field:'title',op:'contains',value:''}]}))}>افزودن شرط</Button>
  </fieldset>)}
  <div className="ods-pattern-actions"><Button onClick={apply}>اعمال فیلتر</Button><Button variant="secondary" onClick={()=>{setDraft(parseFilter(raw));setMessage('پیش‌نویس بازنشانی شد.');}}>بازنشانی پیش‌نویس</Button><Button variant="secondary" onClick={clear}>پاک کردن همه</Button></div>
  <p className="ods-pattern-hint" role="status">{message}</p>
 </Card>
 <Card title="نتایج آزمایشی" description="نشان‌دادن نتایج فقط با شروط اعمال‌شده در URL"><Badge tone="info">{results.length.toLocaleString('fa-IR')} نتیجه</Badge>
 {results.length?<div className="ods-pattern-scroll"><table className="ods-pattern-table"><caption className="sr-only">نتایج نمونه</caption><thead><tr><th>شناسه</th><th>عنوان</th><th>مسئول</th><th>وضعیت</th><th>اولویت</th></tr></thead>
 <tbody>{results.map(row=><tr key={row.id}><td><bdi dir="ltr">{row.id}</bdi></td><td>{row.title}</td><td>{row.owner}</td><td>{row.status}</td><td>{row.priority}</td></tr>)}</tbody></table></div>:
 <EmptyState title="نتیجه‌ای پیدا نشد" description="شرط‌ها را ویرایش کنید یا فیلترها را پاک کنید."/>}</Card>
 <p className="ods-pattern-hint">قرارداد آیندهٔ سرور: اعتبارسنجی نسخه، اجازهٔ فیلد و عملگر، محدودهٔ tenant، سقف تعداد شروط و مقادیر، Query پارامتری و محدودیت نتایج. هیچ SQL دلخواهی پذیرفته نمی‌شود.</p>
 </div>;
}
