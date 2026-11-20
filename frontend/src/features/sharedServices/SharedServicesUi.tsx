import React from 'react';
import {parseApiError} from '../../shared/api/errors';
import {Button} from '../../shared/ui/Primitives';
export function SharedPanel({title,children,description}:{title:string;description?:string;children:React.ReactNode}){
 return <section className="rounded-[24px] bg-white p-4 sm:p-6 shadow-[0_1px_3px_rgb(15_23_42_/_0.035)] border border-slate-200/70 space-y-4">
  <header><h2 className="font-extrabold text-lg text-slate-800">{title}</h2>{description&&<p className="mt-1 text-sm text-slate-500">{description}</p>}</header>{children}
 </section>;
}
export function SharedError({error,onRetry}:{error:unknown;onRetry?:()=>void}){
 const e=parseApiError(error);return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-2"><p>{e.status===403?'مجوز این عملیات وجود ندارد.':e.status===404?'مورد موجود نیست یا دیگر قابل مشاهده نیست.':e.status===409?'وضعیت تغییر کرده؛ اطلاعات را تازه‌سازی کنید.':e.message}</p>{onRetry&&<Button variant="secondary" onClick={onRetry}>تلاش دوباره</Button>}</div>;
}
export function SharedEmpty({message}:{message:string}){return <p role="status" className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{message}</p>;}
export function SharedDate({value}:{value:string|null|undefined}){return <span>{value?new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—'}</span>;}
