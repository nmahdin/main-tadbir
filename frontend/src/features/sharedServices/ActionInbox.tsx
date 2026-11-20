import React,{useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button,LoadingState,Badge} from '../../shared/ui/Primitives';
import {useEnvironment} from '../../app/providers/EnvironmentContext';
import {sharedServicesApi,safeInternalActionPath,type Action} from './sharedServicesApi';
import {visibleActionScope} from './sharedServicesRules';
import {SharedPanel,SharedError,SharedEmpty,SharedDate} from './SharedServicesUi';
const actionScope=(current:{kind:string;id:number|null}|null)=>current?.kind==='organization'?'org:'+current.id:current?.kind==='platform'?'platform':current?.kind==='workspace'?'personal':'none';
export function ActionInbox(){
 const env=useEnvironment();const scope=actionScope(env.current);
 const path=useLocation().pathname,id=Number(path.split('/').pop());const detail=path.startsWith('/shared-services/inbox/')&&Number.isSafeInteger(id)&&id>0;
 const [status,setStatus]=useState('open'),[page,setPage]=useState(1);
 const q=useQuery({queryKey:['c6','inbox',scope,status,page],queryFn:()=>sharedServicesApi.actions(status,page),enabled:!detail&&scope!=='none',retry:false});
 const one=useQuery({queryKey:['c6','inbox-item',scope,id],queryFn:()=>sharedServicesApi.action(id),enabled:detail&&scope!=='none',retry:false});
 const qc=useQueryClient();const dismiss=useMutation({mutationFn:(actionId:number)=>sharedServicesApi.dismissAction(actionId),onSuccess:()=>{void qc.invalidateQueries({queryKey:['c6','inbox']});void qc.invalidateQueries({queryKey:['c6','inbox-item']});}});
 const visible=(item:Action)=>visibleActionScope(item,scope,env.current?.kind==='organization'?env.current.id:null);
 const row=(item:Action)=><article key={item.id} className="rounded-2xl border border-slate-200 p-4 space-y-2">
  <div className="flex flex-wrap justify-between items-start gap-2"><Link to={'/shared-services/inbox/'+item.id} className="font-bold text-[#39677C]">{item.title}</Link>
   <div className="flex gap-2"><Badge tone={item.is_overdue?'danger':item.urgency==='critical'?'warning':'neutral'}>{item.is_overdue?'سررسید گذشته':item.urgency}</Badge><Badge tone={item.resolved_at?'success':'neutral'}>{item.resolved_at?'انجام‌شده':item.action_kind}</Badge></div></div>
  {item.summary&&<p className="text-sm text-slate-600">{item.summary}</p>}
  <p className="text-xs text-slate-500">ماژول: {item.origin_module} · محدوده: {item.recipient_scope==='organization'?'سازمانی':'شخصی'} · موعد: <SharedDate value={item.due_at}/></p>
  <div className="flex flex-wrap gap-3 items-center">
   {safeInternalActionPath(item.deep_link)&&<Link className="text-sm font-semibold text-[#39677C]" to={safeInternalActionPath(item.deep_link)!}>رفتن به بخش مرتبط</Link>}
   {!item.resolved_at&&item.recipient_scope==='personal'&&<Button variant="secondary" disabled={dismiss.isPending} onClick={()=>{if(window.confirm('این مورد فقط از کارتابل شما کنار گذاشته شود؟ این کار عملیات ماژول اصلی را انجام نمی‌دهد.'))dismiss.mutate(item.id);}}>کنار گذاشتن</Button>}
  </div>
 </article>;
 if(scope==='none')return <SharedPanel title="کارتابل اقدام"><SharedEmpty message="ابتدا محیط مجاز را انتخاب کنید."/></SharedPanel>;
 if(detail){if(one.isPending)return <LoadingState/>;if(one.isError)return <SharedError error={one.error}/>;return <SharedPanel title="جزئیات اقدام" description="اقدام واقعی فقط در ماژول مبدأ انجام می‌شود؛ این کارتابل مجری فرامین نیست.">
  {visible(one.data.data)?row(one.data.data):<SharedEmpty message="این اقدام به محیط انتخابی مربوط نیست."/>}
  {dismiss.isError&&<SharedError error={dismiss.error}/>}<Link to="/shared-services/inbox">بازگشت به کارتابل</Link>
 </SharedPanel>;}
 return <SharedPanel title="کارتابل اقدامات" description="موردهای واقعی کارتابل شخصی یا سازمانی با وضعیت و فوریت صادرشده از سرور.">
  <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm">وضعیت <select className="rounded-xl border p-2" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="open">باز</option><option value="overdue">سررسید گذشته</option><option value="resolved">انجام‌شده</option></select></label>
   <span className="text-sm">بازهای همهٔ محیط‌های مجاز: {q.data?.meta?.unresolved_count?.toLocaleString('fa-IR')??'—'}</span></div>
  {q.isPending?<LoadingState/>:q.isError?<SharedError error={q.error} onRetry={()=>void q.refetch()}/>:
   q.data.data.filter(visible).length?<div className="space-y-3">{q.data.data.filter(visible).map(row)}</div>:<SharedEmpty message="اقدامی برای این محیط و فیلتر وجود ندارد."/>}
  {q.data&&<div className="flex flex-wrap gap-3 items-center justify-between text-sm" role="navigation" aria-label="صفحات کارتابل">
   <Button variant="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>صفحه قبل</Button>
   <span>صفحه {page.toLocaleString('fa-IR')} از {(q.data.meta?.last_page??1).toLocaleString('fa-IR')}</span>
   <Button variant="secondary" disabled={page>=(q.data.meta?.last_page??1)} onClick={()=>setPage(p=>p+1)}>صفحه بعد</Button></div>}
  {dismiss.isError&&<SharedError error={dismiss.error}/>}
 </SharedPanel>;
}
