import React,{useState} from 'react';
import {useLocation,Link} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button,LoadingState,EmptyState} from '../../shared/ui/Primitives';
import {commercialFlowsApi,type Finding} from './commercialFlowsApi';
import {Surface,ServerError,Status,date,fa} from './CommercialUi';
function FindingDetail({id}:{id:number}){
 const qc=useQueryClient();const q=useQuery({queryKey:['c5','finding',id],queryFn:()=>commercialFlowsApi.finding(id),retry:false});
 const [note,setNote]=useState('');
 const resolve=useMutation({mutationFn:()=>commercialFlowsApi.resolveFinding(id,note),onSuccess:()=>{void q.refetch();void qc.invalidateQueries({queryKey:['c5','findings']});}});
 if(q.isPending)return <Surface title="جزئیات مغایرت"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 const f=q.data.data.finding;
 return <Surface title={'مغایرت مالی شماره '+fa(f.id)} description="تأیید حل مغایرت به معنی بازپرداخت، اصلاح پرداخت یا تغییر اشتراک نیست.">
  <div className="c5-row"><strong>{f.finding_type}</strong><Status state={f.status}/></div>
  <p>{f.message}</p><p>شدت: {f.severity} · تشخیص: {date(f.detected_at)}</p>
  <p>طرف حساب: <bdi dir="ltr">{f.owner_key}</bdi> · سفارش: {fa(f.related_order_id)} · پرداخت: {fa(f.related_payment_id)}</p>
  {f.evidence&&<pre className="c5-nested" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(f.evidence,null,2)}</pre>}
  {f.status==='open'&&<div className="c5-form"><label>یادداشت مستند حل مغایرت<textarea required value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/></label>
   <Button disabled={!note.trim()||resolve.isPending} loading={resolve.isPending} onClick={()=>{
    if(window.confirm('فقط وضعیت مغایرت با این یادداشت بسته شود؟ این کار پرداخت یا دادهٔ مالی را اصلاح نمی‌کند.'))resolve.mutate();
   }}>ثبت حل با یادداشت</Button></div>}
  {resolve.isError&&<ServerError error={resolve.error}/>}
  <Link className="c5-text-link" to="/billing/platform/findings">بازگشت به مغایرت‌ها</Link>
 </Surface>;
}
export function PlatformFinance(){
 const path=useLocation().pathname;const id=Number(path.split('/').pop());
 const [status,setStatus]=useState('open');
 const q=useQuery({queryKey:['c5','findings',status],queryFn:()=>commercialFlowsApi.findings(status),enabled:path==='/billing/platform/findings',retry:false});
 const cache=useQueryClient();
 const sweep=useMutation({mutationFn:commercialFlowsApi.reconciliationSweep,onSuccess:()=>void cache.invalidateQueries({queryKey:['c5','findings']})});
 if(path.startsWith('/billing/platform/findings/')&&Number.isSafeInteger(id)&&id>0)return <FindingDetail id={id}/>;
 if(q.isPending)return <Surface title="مغایرت‌های مالی"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 return <Surface title="پایش مغایرت‌های مالی" description="M6 — گزارش واقعی سرور؛ رفع موارد نیازمند رسیدگی انسانی است. هیچ برداشت یا بازپرداخت خودکاری اجرا نمی‌شود.">
  <div className="c5-row"><label>وضعیت <select value={status} onChange={e=>setStatus(e.target.value)}><option value="open">باز</option><option value="resolved">بسته</option><option value="">همه</option></select></label>
  <Button variant="secondary" disabled={sweep.isPending} loading={sweep.isPending} onClick={()=>{if(window.confirm('پویش مغایرت‌های مالی از سرور درخواست شود؟'))sweep.mutate();}}>اجرای پویش</Button></div>
  {sweep.isError&&<ServerError error={sweep.error}/>}
  {sweep.data&&<p role="status">مغایرت باز: {fa(sweep.data.data.summary.total_open)} · جدید: {fa(sweep.data.data.summary.opened)}</p>}
  {!q.data.data.findings.length?<EmptyState title="مغایرتی با این فیلتر یافت نشد"/>:
  <div className="c5-table-scroll"><table className="c5-table"><thead><tr><th>شناسه</th><th>نوع</th><th>شدت</th><th>وضعیت</th><th>زمان</th><th>جزئیات</th></tr></thead><tbody>
   {q.data.data.findings.map((f:Finding)=><tr key={f.id}><td>{fa(f.id)}</td><td>{f.finding_type}</td><td>{f.severity}</td><td><Status state={f.status}/></td><td>{date(f.detected_at)}</td><td><Link to={'/billing/platform/findings/'+f.id}>بررسی</Link></td></tr>)}
  </tbody></table></div>}
 </Surface>;
}
