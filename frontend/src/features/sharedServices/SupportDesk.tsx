import React,{useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button,Badge,LoadingState} from '../../shared/ui/Primitives';
import {useAuth} from '../../app/providers/AuthContext';
import {useEnvironment} from '../../app/providers/EnvironmentContext';
import {sharedServicesApi,type SupportSummary,type SupportReply} from './sharedServicesApi';
import {SharedPanel,SharedError,SharedEmpty,SharedDate} from './SharedServicesUi';
const input='block w-full rounded-xl border border-slate-200 p-2 text-sm';
const categoryOptions=['billing','account','technical','feature_request','other'];
export function SupportDesk(){
 const {current,payload}=useEnvironment(),{currentUser}=useAuth();
 const path=useLocation().pathname,navigate=useNavigate(),parts=path.split('/'),id=Number(parts.at(-1));
 const platform=path.startsWith('/shared-services/support/queue');
 const isDetail=path.startsWith('/shared-services/support/tickets/')&&Number.isSafeInteger(id)&&id>0;
 const agent=Boolean(current?.kind==='platform'&&payload?.platform.eligible&&(
  payload.platform.permissions.includes('platform.support.agent')));
 const manager=Boolean(current?.kind==='platform'&&payload?.platform.eligible&&payload.platform.permissions.includes('platform.support.manage'));
 const [priority,setPriority]=useState(''),[subject,setSubject]=useState(''),[category,setCategory]=useState('technical'),[body,setBody]=useState('');
 const [reply,setReply]=useState(''),[note,setNote]=useState(false),[files,setFiles]=useState<File[]>([]),[newFiles,setNewFiles]=useState<File[]>([]),[nextStatus,setNextStatus]=useState('open'),[assignee,setAssignee]=useState('');
 const qc=useQueryClient();const scope=current?.kind+':'+current?.id;
 const list=useQuery({queryKey:['c6','tickets',scope],queryFn:sharedServicesApi.tickets,enabled:!platform&&!isDetail,retry:false});
 const queue=useQuery({queryKey:['c6','support-queue',scope,priority],queryFn:()=>sharedServicesApi.queue(priority),enabled:platform&&agent&&!isDetail,retry:false});
 const detail=useQuery({queryKey:['c6','ticket',scope,id],queryFn:()=>sharedServicesApi.ticket(id),enabled:isDetail,retry:false});
 const refresh=()=>{void qc.invalidateQueries({queryKey:['c6','tickets']});void qc.invalidateQueries({queryKey:['c6','support-queue']});void qc.invalidateQueries({queryKey:['c6','ticket']});};
 const create=useMutation({mutationFn:()=>newFiles.length?sharedServicesApi.createTicketWithAttachments(subject.trim(),category,body.trim(),newFiles):sharedServicesApi.createTicket({subject:subject.trim(),category,body:body.trim()}),onSuccess:r=>{refresh();navigate('/shared-services/support/tickets/'+r.data.id);}});
 const send=useMutation({mutationFn:()=>files.length?sharedServicesApi.replyWithAttachments(id,reply,files,note):sharedServicesApi.reply(id,reply,note),onSuccess:()=>{setReply('');setFiles([]);setNote(false);refresh();}});
 const claim=useMutation({mutationFn:()=>sharedServicesApi.claim(id,Number(currentUser.id)),onSuccess:refresh});
 const assign=useMutation({mutationFn:()=>sharedServicesApi.assign(id,assignee.trim()?Number(assignee):null),onSuccess:refresh});
 const change=useMutation({mutationFn:()=>sharedServicesApi.status(id,nextStatus),onSuccess:refresh});
 const download=useMutation({mutationFn:(token:string)=>sharedServicesApi.downloadAttachment(token),onSuccess:blob=>{
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='support-attachment';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 }});
 const listing=(t:SupportSummary)=><Link key={t.id} to={'/shared-services/support/tickets/'+t.id} className="block rounded-2xl border border-slate-200 p-4 hover:border-[#39677C] focus-visible:outline focus-visible:outline-2">
  <div className="flex flex-wrap justify-between gap-2"><strong>{t.subject}</strong><Badge tone={t.status==='closed'?'neutral':'warning'}>{t.status}</Badge></div>
  <p className="text-xs text-slate-500 mt-2">شماره {t.reference} · اولویت {t.priority} · آخرین پاسخ: <SharedDate value={t.last_replied_at}/></p>
 </Link>;
 if(isDetail){
  if(detail.isPending)return <LoadingState/>;
  if(detail.isError)return <SharedPanel title="جزئیات تیکت"><SharedError error={detail.error} onRetry={()=>void detail.refetch()}/></SharedPanel>;
  const ticket=detail.data.data;
  const isOwner=String(ticket.owner?.id??ticket.owner_user_id)===String(currentUser.id);
  const staff=(agent||manager)&&!isOwner;
  return <SharedPanel title={'تیکت '+ticket.reference} description={ticket.subject}>
   <div className="flex gap-3"><Badge tone="neutral">{ticket.status}</Badge><Badge tone="neutral">{ticket.priority}</Badge></div>
   <div className="space-y-3" aria-label="گفتگوی پشتیبانی">{ticket.messages.filter((m:SupportReply)=>staff||!m.internal_note).map(m=><article key={m.id} className={'rounded-2xl border p-4 '+(m.internal_note?'border-amber-200 bg-amber-50':'border-slate-200')}>
    <div className="flex justify-between gap-2 text-xs text-slate-500"><strong>{m.author_name??m.author_role}{m.internal_note?' · یادداشت داخلی':''}</strong><SharedDate value={m.created_at}/></div>
    <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{m.body}</p>
    {m.attachments?.map(a=><Button key={a.attachment_id} variant="secondary" disabled={download.isPending} onClick={()=>download.mutate(a.access_token)}>دریافت امن: {a.name}</Button>)}
   </article>)}</div>
   {download.isError&&<SharedError error={download.error}/>}
   {staff&&ticket.activity?.length>0&&<details><summary className="cursor-pointer font-bold">سابقه اقدامات کارکنان</summary><div className="space-y-2 mt-2">{ticket.activity.map(a=><p key={a.id} className="text-sm">{a.event_type} · <SharedDate value={a.created_at}/></p>)}</div></details>}
   <div className="space-y-3"><h3 className="font-bold">پاسخ جدید</h3>
    <label className="block text-sm">پیام<textarea className={input} rows={4} value={reply} onChange={e=>setReply(e.target.value)} maxLength={20000}/></label>
    {staff&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={note} onChange={e=>setNote(e.target.checked)}/> یادداشت فقط برای کارکنان</label>}
    <label className="block text-sm">پیوست‌های مجاز (حداکثر ۶ فایل، هر فایل ۱۰ مگابایت)
     <input className={input} type="file" multiple onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>
    <Button disabled={!reply.trim()||send.isPending||files.length>6||files.some(f=>f.size>10*1024*1024)} loading={send.isPending} onClick={()=>send.mutate()}>ارسال پاسخ</Button>
    {send.isError&&<SharedError error={send.error}/>}</div>
   {staff&&<div className="rounded-2xl border p-4 space-y-3"><h3 className="font-bold">اقدامات پشتیبانی</h3>
    {agent&&!ticket.assignee&&<Button disabled={claim.isPending} onClick={()=>{if(window.confirm('این تیکت به خودتان اختصاص داده شود؟'))claim.mutate();}}>دریافت تیکت توسط خودم</Button>}
    {manager&&<><label className="block text-sm">شناسه کاربر پشتیبان<input className={input} type="number" min={1} value={assignee} onChange={e=>setAssignee(e.target.value)}/></label>
      <Button variant="secondary" disabled={assign.isPending||!!assignee&&!Number.isSafeInteger(Number(assignee))} onClick={()=>{if(window.confirm('مسئول این تیکت تغییر کند؟'))assign.mutate();}}>تغییر مسئول / حذف تخصیص</Button>
      <label className="block text-sm">وضعیت<select className={input} value={nextStatus} onChange={e=>setNextStatus(e.target.value)}>
       {['new','open','pending_reply','pending_user','resolved','closed'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <Button variant="secondary" disabled={change.isPending} onClick={()=>{if(window.confirm('وضعیت این تیکت تغییر کند؟'))change.mutate();}}>ثبت وضعیت</Button></>}
    {claim.isError&&<SharedError error={claim.error}/>}
    {assign.isError&&<SharedError error={assign.error}/>}
    {change.isError&&<SharedError error={change.error}/>}
   </div>}
   <Link to={platform?'/shared-services/support/queue':'/shared-services/support'}>بازگشت به پشتیبانی</Link>
  </SharedPanel>;
 }
 if(platform){if(!agent)return <SharedPanel title="صف پشتیبانی"><SharedEmpty message="مجوز پشتیبانی پلتفرم موجود نیست."/></SharedPanel>;
  return <SharedPanel title="صف پشتیبانی پلتفرم" description="تیکت‌های عمومی پلتفرم؛ دریافت توسط کارشناس مجاز و تغییر مسئول فقط توسط مدیر.">
   <label className="block text-sm">اولویت<select className={input} value={priority} onChange={e=>setPriority(e.target.value)}><option value="">همه</option>{['low','normal','high','urgent'].map(v=><option key={v}>{v}</option>)}</select></label>
   {queue.isPending?<LoadingState/>:queue.isError?<SharedError error={queue.error}/>:queue.data.data.length?<div className="space-y-3">{queue.data.data.map(listing)}</div>:<SharedEmpty message="تیکتی در صف نیست."/>}
  </SharedPanel>;
 }
 return <SharedPanel title="پشتیبانی سامانه" description="گفتگوی پشتیبانی هر کاربر خصوصی است؛ عضویت سازمانی اجازه مشاهده تیکت دیگران نیست.">
  <details className="rounded-2xl border p-4"><summary className="cursor-pointer font-bold">ثبت درخواست جدید</summary>
   <div className="mt-3 space-y-3"><label className="block text-sm">موضوع<input className={input} value={subject} onChange={e=>setSubject(e.target.value)} maxLength={200}/></label>
    <label className="block text-sm">دسته<select className={input} value={category} onChange={e=>setCategory(e.target.value)}>{categoryOptions.map(c=><option key={c}>{c}</option>)}</select></label>
    <label className="block text-sm">شرح<textarea className={input} rows={5} value={body} onChange={e=>setBody(e.target.value)} maxLength={20000}/></label>
    <label className="block text-sm">پیوست اولیه (تا ۶ فایل، حداکثر ۱۰ مگابایت برای هر فایل)
      <input className={input} type="file" multiple onChange={e=>setNewFiles(Array.from(e.target.files??[]))}/></label>
    <Button disabled={subject.trim().length<3||body.trim().length<2||newFiles.length>6||newFiles.some(f=>f.size>10*1024*1024)||create.isPending} loading={create.isPending} onClick={()=>create.mutate()}>ثبت درخواست</Button>
    {create.isError&&<SharedError error={create.error}/>}</div>
  </details>
  {list.isPending?<LoadingState/>:list.isError?<SharedError error={list.error} onRetry={()=>void list.refetch()}/>:list.data.data.length?<div className="space-y-3">{list.data.data.map(listing)}</div>:<SharedEmpty message="درخواست پشتیبانی ثبت نشده است."/>}
 </SharedPanel>;
}
