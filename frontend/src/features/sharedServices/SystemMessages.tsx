import React,{useState} from 'react';
import {useLocation,Link} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button,Badge,LoadingState} from '../../shared/ui/Primitives';
import {useEnvironment} from '../../app/providers/EnvironmentContext';
import {sharedServicesApi,type SystemDelivery,type AdminMessage} from './sharedServicesApi';
import {SharedPanel,SharedError,SharedEmpty,SharedDate} from './SharedServicesUi';
const field='block w-full rounded-xl border border-slate-200 p-2 text-sm';
export function SystemMessages(){
 const {current,payload}=useEnvironment();const loc=useLocation();const platform=loc.pathname.startsWith('/shared-services/messages/admin');
 const admin=Boolean(current?.kind==='platform'&&payload?.platform.eligible&&payload.platform.permissions.includes('platform.messages.manage'));
 const [unread,setUnread]=useState(false),[status,setStatus]=useState(''),[slug,setSlug]=useState(''),[title,setTitle]=useState(''),[body,setBody]=useState(''),[ack,setAck]=useState(false),[version,setVersion]=useState(''),[bump,setBump]=useState(false);
 const qc=useQueryClient(),scope=(current?.kind??'none')+':'+current?.id;
 const messages=useQuery({queryKey:['c6','messages',scope,unread],queryFn:()=>sharedServicesApi.messages(unread),enabled:!platform,retry:false});
 const pending=useQuery({queryKey:['c6','pending-acks',scope],queryFn:sharedServicesApi.pendingAcks,enabled:!platform,retry:false});
 const adminList=useQuery({queryKey:['c6','admin-messages',scope,status],queryFn:()=>sharedServicesApi.adminMessages(status),enabled:platform&&admin,retry:false});
 const refresh=()=>{void qc.invalidateQueries({queryKey:['c6','messages']});void qc.invalidateQueries({queryKey:['c6','pending-acks']});void qc.invalidateQueries({queryKey:['c6','admin-messages']});};
 const mark=useMutation({mutationFn:(id:number)=>sharedServicesApi.markRead(id),onSuccess:refresh});
 const acknowledge=useMutation({mutationFn:(id:number)=>sharedServicesApi.acknowledge(id),onSuccess:refresh});
 const create=useMutation({mutationFn:()=>sharedServicesApi.createMessage({slug:slug.trim(),title:title.trim(),body_markdown:body.trim(),audience:'platform',ack_required:ack,ack_policy_version:ack?version.trim():undefined,publish:false,bump_version:bump}),onSuccess:()=>{setTitle('');setBody('');refresh();}});
 const change=useMutation({mutationFn:({id,action}:{id:number;action:'publish'|'retire'})=>action==='publish'?sharedServicesApi.publishMessage(id):sharedServicesApi.retireMessage(id),onSuccess:refresh});
 if(platform&&!admin)return <SharedPanel title="مدیریت پیام‌های رسمی"><SharedEmpty message="مجوز platform.messages.manage برای این محیط وجود ندارد."/></SharedPanel>;
 if(platform)return <SharedPanel title="مدیریت پیام‌های رسمی پلتفرم" description="نسخه‌های منتشرشده تغییرناپذیرند. انتشار و بازنشانی تأیید نیازمند اقدام صریح است.">
  <div className="rounded-2xl border p-4 space-y-3"><h3 className="font-bold">پیام رسمی جدید / نسخه جدید</h3>
   <label className="block text-sm">شناسه یکتا انگلیسی<input className={field} value={slug} onChange={e=>setSlug(e.target.value)} pattern="[a-z0-9.-]+" maxLength={100}/></label>
   <label className="block text-sm">عنوان<input className={field} value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/></label>
   <label className="block text-sm">متن پیام (Markdown به صورت متن ساده)<textarea className={field} value={body} onChange={e=>setBody(e.target.value)} rows={5}/></label>
   <label className="flex gap-2"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> نیازمند تأیید صریح دریافت</label>
   {ack&&<label className="block text-sm">شناسه سیاست تأیید<input className={field} value={version} onChange={e=>setVersion(e.target.value)} maxLength={64}/></label>}
   <label className="flex gap-2"><input type="checkbox" checked={bump} onChange={e=>setBump(e.target.checked)}/> ایجاد نسخه جدید برای شناسه قبلی</label>
   <Button disabled={!/^[a-z0-9.-]+$/.test(slug)||!title.trim()||!body.trim()||(ack&&!version.trim())||create.isPending} loading={create.isPending} onClick={()=>create.mutate()}>ذخیره پیش‌نویس (بدون انتشار)</Button>
   {create.isError&&<SharedError error={create.error}/>}
  </div>
  <label className="text-sm">وضعیت <select className={field} value={status} onChange={e=>setStatus(e.target.value)}><option value="">همه</option><option value="draft">پیش‌نویس</option><option value="published">منتشرشده</option><option value="retired">بازنشسته</option></select></label>
  {adminList.isPending?<LoadingState/>:adminList.isError?<SharedError error={adminList.error}/>:!adminList.data.data.length?<SharedEmpty message="پیامی برای این فیلتر وجود ندارد."/>:
   <div className="space-y-3">{adminList.data.data.map((m:AdminMessage)=><div key={m.id} className="rounded-xl border p-3 space-y-2">
    <div className="flex gap-3 justify-between"><strong>{m.title}</strong><Badge tone={m.status==='published'?'success':'neutral'}>{m.status}</Badge></div>
    <p className="text-xs text-slate-500"><bdi dir="ltr">{m.slug}</bdi> · نسخه {m.version.toLocaleString('fa-IR')} · {m.audience} · تأیید لازم: {m.ack_required?'بله':'خیر'}</p>
    {m.status==='draft'&&<Button disabled={change.isPending} onClick={()=>{if(window.confirm('این نسخه برای مخاطبان منتشر شود؟'))change.mutate({id:m.id,action:'publish'});}}>انتشار</Button>}
    {m.status==='published'&&<Button variant="secondary" disabled={change.isPending} onClick={()=>{if(window.confirm('این نسخه از نمایش فعال کنار گذاشته شود؟'))change.mutate({id:m.id,action:'retire'});}}>بازنشسته کردن</Button>}
   </div>)}</div>}
  {change.isError&&<SharedError error={change.error}/>}
 </SharedPanel>;
 const userMessages=messages.data?.data??[];
 return <SharedPanel title="پیام‌های رسمی سامانه" description="خواندن، به معنی تأیید پیام نیست. پیام‌های تأیید الزامی نسخه مستقل دارند.">
  {pending.data?.data.length?<div role="status" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">پیام‌های نیازمند تأیید: {pending.data.data.length.toLocaleString('fa-IR')}. تأیید هر نسخه فقط با انتخاب شما ثبت می‌شود.</div>:null}
  <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={unread} onChange={e=>setUnread(e.target.checked)}/> فقط خوانده‌نشده‌ها</label>
  {messages.isPending?<LoadingState/>:messages.isError?<SharedError error={messages.error} onRetry={()=>void messages.refetch()}/>:!userMessages.length?<SharedEmpty message="پیام رسمی تازه‌ای وجود ندارد."/>:
   <div className="space-y-3">{userMessages.map((m:SystemDelivery)=><article key={m.delivery_id} className="rounded-2xl border border-slate-200 p-4 space-y-2">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{m.title}</h3><div className="flex gap-2">
     {!m.read_at&&<Badge tone="warning">خوانده‌نشده</Badge>}{m.ack_required&&!m.acknowledged_at&&<Badge tone="danger">تأیید لازم</Badge>}</div></div>
    <p className="text-xs text-slate-500">نسخه {m.version.toLocaleString('fa-IR')} · {m.category??m.audience} · دریافت: <SharedDate value={m.first_delivered_at}/></p>
    <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{m.body_markdown}</div>
    <div className="flex flex-wrap gap-3 items-center">
     {!m.read_at&&<Button variant="secondary" disabled={mark.isPending} onClick={()=>mark.mutate(m.delivery_id)}>ثبت خوانده‌شدن</Button>}
     {m.ack_required&&!m.acknowledged_at&&<Button disabled={acknowledge.isPending} onClick={()=>{if(window.confirm('آیا متن نسخه '+m.version+' را مطالعه کرده و دریافت آن را صریحاً تأیید می‌کنید؟'))acknowledge.mutate(m.delivery_id);}}>تأیید صریح نسخه</Button>}
     {m.acknowledged_at&&<p className="text-xs text-emerald-700">تأییدشده در <SharedDate value={m.acknowledged_at}/></p>}
     {m.cta_link?.startsWith('/')&&!m.cta_link.startsWith('//')&&<Link to={m.cta_link} className="text-sm text-[#39677C]">{m.cta_label}</Link>}
    </div>
   </article>)}</div>}
  {mark.isError&&<SharedError error={mark.error}/>}
  {acknowledge.isError&&<SharedError error={acknowledge.error}/>}
  {pending.isError&&<SharedError error={pending.error}/>}
 </SharedPanel>;
}
