import React,{useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button,LoadingState,EmptyState} from '../../shared/ui/Primitives';
import {type OwnerScope,PERIOD_LABELS,toman} from './commercialApi';
import {commercialFlowsApi,confirmedPayment,fulfilledPayment,type FinancialDocument} from './commercialFlowsApi';
import {Surface,ServerError,Status,MoneyBreakdown,date,fa} from './CommercialUi';
const ownerKey=(s:OwnerScope)=>s.kind==='personal'?'personal':'org:'+s.organizationId;
function PaymentDetails({id,scope}:{id:number;scope:OwnerScope}){
 const qc=useQueryClient();const q=useQuery({queryKey:['c5','payment',ownerKey(scope),id],queryFn:()=>commercialFlowsApi.payment(id),retry:false,refetchOnWindowFocus:true});
 const verify=useMutation({mutationFn:()=>commercialFlowsApi.reconcilePayment(id),onSuccess:()=>{void q.refetch();void qc.invalidateQueries({queryKey:['c5','subscription']});void qc.invalidateQueries({queryKey:['c5','documents']});}});
 if(q.isPending)return <Surface title="وضعیت پرداخت"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 const p=q.data.data.payment;
 return <Surface title={'پرداخت شماره '+fa(p.id)} description="پارامترهای بازگشت درگاه مدرک پرداخت نیستند؛ فقط وضعیت صادرشده توسط سرور معتبر است.">
  <div className="c5-row"><strong>{fulfilledPayment(p)?'تأمین اشتراک در سرور تأیید شد':confirmedPayment(p)?'پرداخت تأیید شده؛ تأمین اشتراک در انتظار بررسی':p.status==='failed'?'پرداخت ناموفق':'پرداخت در انتظار بررسی سرور'}</strong><Status state={p.status}/></div>
  <p>سفارش: <Link to={'/billing/orders/'+p.order_id}>{fa(p.order_id)}</Link> · مبلغ درخواست‌شده: {toman(p.requested_amount_toman)}</p>
  <p>مبلغ تأییدشده: {toman(p.verified_amount_toman)} · ارز: {p.currency}</p><p>شروع: {date(p.initiated_at)} · تأیید: {date(p.verified_at)}</p>
  {p.failure_reason&&<p className="c5-message c5-message--error" role="alert">{p.failure_reason}</p>}
  {confirmedPayment(p)&&!fulfilledPayment(p)&&<p className="c5-message c5-message--warning" role="status">تسویه تأییدشده است اما هنوز نمی‌توان فعال‌شدن اشتراک را اعلام کرد.</p>}
  <div className="c5-actions"><Button variant="secondary" onClick={()=>void q.refetch()}>بروزرسانی وضعیت</Button>
    {['initiated','pending'].includes(p.status)&&<Button disabled={verify.isPending} loading={verify.isPending} onClick={()=>{if(window.confirm('یک بار از سرور وضعیت پرداخت را بررسی کنیم؟'))verify.mutate();}}>بررسی وضعیت در سرور</Button>}
    <Link className="c5-text-link" to="/billing/subscription-details">اشتراک</Link>
    <Link className="c5-text-link" to={'/billing/documents?order_id='+p.order_id}>اسناد سفارش</Link></div>
  {verify.isError&&<ServerError error={verify.error}/>}
 </Surface>;
}
function SubscriptionDetails({scope}:{scope:OwnerScope}){
 const q=useQuery({queryKey:['c5','subscription',ownerKey(scope)],queryFn:()=>commercialFlowsApi.subscription(scope),retry:false});
 if(q.isPending)return <Surface title="اشتراک"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 const s=q.data.data.subscription;
 return <Surface title="دوره و وضعیت اشتراک" description="تمام وضعیت‌ها و تاریخ‌های مؤثر از قرارداد واقعی سرور دریافت می‌شوند.">
 {!s?<EmptyState title="اشتراکی ثبت نشده"/>:<>
  <div className="c5-row"><strong><bdi dir="ltr">{s.plan_key}</bdi> · نسخه {fa(s.plan_version)}</strong><Status state={s.state}/></div>
  <p>دوره خرید: {s.billing_period?PERIOD_LABELS[s.billing_period]:'نامشخص / رایگان'}</p>
  <p>شروع: {date(s.starts_at)} · پایان: {date(s.expires_at)} · پایان ارفاق: {date(s.grace_ends_at)}</p>
  {s.state==='grace'&&<p className="c5-message c5-message--warning">مهلت ارفاق هفت‌روزه فعال است. تمدید فقط به‌صورت دستی و مطابق وضعیت سرور انجام می‌شود.</p>}
  {s.state==='expired'&&<p className="c5-message c5-message--warning">اشتراک منقضی شده است. منابع و داده‌های پیشین حفظ می‌شوند و تخصیص جدید تابع محدودیت‌های سرور است.</p>}
  <div className="c5-grid c5-grid--two">{s.limits.map(l=><div className="c5-nested" key={l.key}><strong>{l.key}</strong><p>{l.is_unlimited?'نامحدود':l.limit_value===null?'نامشخص':fa(l.limit_value)}</p></div>)}</div>
  </>}
  <p className="c5-muted">تمدید دستی، ارتقای فوری بدون اعتباردهی به زمان استفاده‌نشده و تنزل پایان دوره، در مسیر پیش‌فاکتور ← سفارش ← پرداخت سرور انجام می‌شود؛ این صفحه تاریخ یا اعتبار جدید محاسبه نمی‌کند.</p>
  <div className="c5-actions"><Link to="/billing/catalog">انتخاب طرح یا تمدید دستی</Link><Link to="/billing/orders">سابقه سفارش‌ها</Link></div>
 </Surface>;
}
function DocumentDetail({id}:{id:number}){
 const detail=useQuery({queryKey:['c5','document',id],queryFn:()=>commercialFlowsApi.document(id),retry:false});
 const render=useQuery({queryKey:['c5','render',id],queryFn:()=>commercialFlowsApi.renderDocument(id),retry:false});
 if(detail.isPending||render.isPending)return <Surface title="سند مالی"><LoadingState/></Surface>;
 if(detail.isError)return <ServerError error={detail.error}/>;
 if(render.isError)return <ServerError error={render.error}/>;
 const d=detail.data.data.document,r=render.data.data.render;
 return <Surface title={(r.doc_type==='invoice'?'صورتحساب ':'رسید ')+r.doc_number} description="چاپ یا ذخیره به PDF توسط مرورگر انجام می‌شود؛ این فایل PDF تولیدشده توسط سرور نیست.">
  <article className="c5-nested c5-print-document" dir="rtl">
   <h3>سامانه تدبیر — {r.doc_type==='invoice'?'صورتحساب':'رسید پرداخت'}</h3>
   <p>شماره سند: <bdi dir="ltr">{r.doc_number}</bdi> · تاریخ: {date(r.issued_at)}</p>
   <div className="c5-grid c5-grid--two"><p>فروشنده: {r.seller.name}</p><p>خریدار: {r.buyer.name}</p></div>
   <p>طرح: {r.plan.name} · دوره: {r.plan.period}</p>
   <div className="c5-table-scroll"><table className="c5-table"><thead><tr><th>شرح</th><th>تعداد</th><th>مبلغ</th></tr></thead><tbody>{r.items.map((l,i)=><tr key={i}><td>{l.description}</td><td>{fa(l.quantity)}</td><td>{toman(l.amount_toman)}</td></tr>)}</tbody></table></div>
   <MoneyBreakdown snapshot={r.totals}/>
   {r.notes&&<p>{r.notes}</p>}
   <p className="c5-muted">سفارش {fa(d.order_id)} · پرداخت {fa(d.payment_id)} · وضعیت {r.status}</p>
  </article><div className="c5-actions"><Button onClick={()=>window.print()}>چاپ / ذخیره PDF از مرورگر</Button><Link to="/billing/documents">بازگشت</Link></div>
 </Surface>;
}
function Documents({scope}:{scope:OwnerScope}){
 const loc=useLocation(),params=new URLSearchParams(loc.search),order=Number(params.get('order_id')||0);
 const [type,setType]=useState('');
 const q=useQuery({queryKey:['c5','documents',ownerKey(scope),type,order],queryFn:()=>commercialFlowsApi.documents(scope,type,Number.isSafeInteger(order)&&order>0?order:undefined),retry:false});
 if(q.isPending)return <Surface title="اسناد مالی"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 return <Surface title="صورتحساب‌ها و رسیدها" description="این فهرست تنها شامل اسناد مالی صادرشده توسط سرور است.">
  <label>نوع سند <select value={type} onChange={e=>setType(e.target.value)}><option value="">همه</option><option value="invoice">صورتحساب</option><option value="receipt">رسید</option></select></label>
  {order>0&&<p>فیلتر سفارش {fa(order)} · <Link to="/billing/documents">حذف فیلتر</Link></p>}
  {!q.data.data.documents.length?<EmptyState title="سند صادرشده‌ای یافت نشد" description="پرداختِ در حال بررسی به معنی صدور سند نیست."/>:
  <div className="c5-table-scroll"><table className="c5-table"><thead><tr><th>شماره</th><th>نوع</th><th>تاریخ</th><th>مبلغ</th><th>سفارش</th><th>جزئیات</th></tr></thead><tbody>
  {q.data.data.documents.map((d:FinancialDocument)=><tr key={d.id}><td><bdi dir="ltr">{d.number}</bdi></td><td>{d.type==='invoice'?'صورتحساب':'رسید'}</td><td>{date(d.issued_at)}</td><td>{toman(d.total_toman)}</td><td>{fa(d.order_id)}</td><td><Link to={'/billing/documents/'+d.id}>مشاهده</Link></td></tr>)}
  </tbody></table></div>}
 </Surface>;
}
export function CommercialFlows({scope}:{scope:OwnerScope}){
 const path=useLocation().pathname,id=Number(path.split('/').pop());
 if(path==='/billing/subscription-details')return <SubscriptionDetails scope={scope}/>;
 if(path==='/billing/documents')return <Documents scope={scope}/>;
 if(path.startsWith('/billing/documents/')&&Number.isSafeInteger(id)&&id>0)return <DocumentDetail id={id}/>;
 if(path.startsWith('/billing/payments/')&&Number.isSafeInteger(id)&&id>0)return <PaymentDetails scope={scope} id={id}/>;
 return <Surface><EmptyState title="مسیر مالی یافت نشد"/></Surface>;
}
