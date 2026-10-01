import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { PageHeader, Button, EmptyState } from '../common/Primitives';
import { RelatedRecords } from './RelatedRecords';
export function ArchiveWorkspace(){
  const {hasPermission}=useApp();const [params,setParams]=useSearchParams();
  const modules=([{id:'tasks',label:'وظایف',permission:'tasks.view'},{id:'projects',label:'پروژه‌ها',permission:'projects.view'},{id:'contents',label:'محتواها',permission:'content.view'}] as const).filter(m=>hasPermission(m.permission));
  const selected=modules.find(m=>m.id===params.get('module'))||modules[0];
  return <section className="p-4 space-y-4" dir="rtl"><PageHeader title="بایگانی" description="رکوردهای سرور؛ بازیابی به وضعیت ثبت‌شدهٔ پیش از بایگانی انجام می‌شود."/>
    <nav aria-label="نوع بایگانی" className="flex gap-2">{modules.map(m=><Button key={m.id} variant={selected?.id===m.id?'primary':'secondary'} onClick={()=>{const next=new URLSearchParams(params);next.set('module',m.id);setParams(next);}}>{m.label}</Button>)}</nav>
    {selected?<RelatedRecords module={selected.id} scope={{status:'archived'}}/>:<EmptyState title="مجوز مشاهدهٔ موارد بایگانی را ندارید."/>}
  </section>;
}
