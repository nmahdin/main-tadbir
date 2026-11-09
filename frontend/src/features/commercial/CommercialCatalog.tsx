import React,{useRef,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useQuery,useMutation} from '@tanstack/react-query';
import {Button,Badge,LoadingState,EmptyState} from '../../shared/ui/Primitives';
import {commercialApi,PERIODS,PERIOD_LABELS,toman,type Entry,type OwnerScope,type Period} from './commercialApi';
import {Surface,PeriodSelect,ServerError} from './CommercialUi';

function PlanDetail({entry,scope}:{entry:Entry;scope:OwnerScope}){
 const navigate=useNavigate();
 const first=PERIODS.find(period=>entry.prices[period]!==null)??'monthly';
 const [period,setPeriod]=useState<Period>(first),[promo,setPromo]=useState('');
 const keyRef=useRef<string>('');
 const mutate=useMutation({mutationFn:async()=>{
  if(!entry.prices[period])throw new Error('این دوره برای طرح انتخابی قابل خرید نیست.');
  if(!keyRef.current)keyRef.current=crypto.randomUUID();
  return commercialApi.createQuote(scope,entry.version.id,period,promo.trim()||undefined,keyRef.current);
 },onSuccess:response=>navigate('/billing/quotes/'+response.data.quote.id)});
 const changePeriod=(next:Period)=>{setPeriod(next);keyRef.current='';mutate.reset();};
 return <Surface title={'جزئیات طرح '+entry.plan.name} description="A03 — انتخاب دورهٔ منتشرشده و درخواست پیش‌فاکتور معتبر از سرور">
  <div className="c5-grid c5-grid--two">
   <section className="c5-nested"><h3>مشخصات طرح</h3><p className="c5-muted">شناسه: <bdi dir="ltr">{entry.plan.key}</bdi></p><p className="c5-muted">نسخهٔ منتشرشده: {entry.version.version.toLocaleString('fa-IR')}</p>
    <p className="c5-muted">فقط قیمت‌ها و دوره‌های منتشرشده نمایش داده می‌شوند؛ سهمیه‌های مقایسه‌ای در این API ارائه نشده‌اند.</p></section>
   <section className="c5-nested"><h3>انتخاب دورهٔ پرداخت</h3><PeriodSelect value={period} onChange={changePeriod} available={entry.prices}/>
    <p className="c5-muted">مبلغ فوق قیمت دوره است؛ مبلغ نهایی، تخفیف و مالیات فقط پس از پاسخ پیش‌فاکتور مشخص می‌شوند.</p></section>
  </div>
  <div className="c5-form" style={{marginTop:18,maxWidth:420}}><label htmlFor="c5-promo">کد تخفیف (اختیاری)</label>
   <input id="c5-promo" value={promo} maxLength={32} placeholder="کد معتبر" onChange={e=>{setPromo(e.target.value);keyRef.current='';mutate.reset();}}/></div>
  {mutate.isError&&<ServerError error={mutate.error} retry={()=>mutate.reset()}/>}
  <div className="c5-actions"><Button disabled={!entry.prices[period]||mutate.isPending} loading={mutate.isPending} onClick={()=>mutate.mutate()}>صدور پیش‌فاکتور</Button>
   <Link className="c5-text-link" to="/billing/catalog">بازگشت به مقایسه طرح‌ها</Link></div>
 </Surface>;
}

export function CommercialCatalog({scope}:{scope:OwnerScope}){
 const location=useLocation();
 const catalog=useQuery({queryKey:['c5','catalog'],queryFn:commercialApi.catalog,retry:false});
 const selectedId=location.pathname.startsWith('/billing/plan/')?Number(location.pathname.split('/').pop()):null;
 const plans=catalog.data?.data.plans.filter(x=>x.plan.audience===scope.kind)??[];
 const selected=selectedId===null?null:plans.find(x=>x.version.id===selectedId);
 if(catalog.isPending)return <Surface title="مقایسه طرح‌ها"><LoadingState/></Surface>;
 if(catalog.isError)return <ServerError error={catalog.error} retry={()=>void catalog.refetch()}/>;
 if(selectedId!==null)return selected?<div key={selected.version.id}><PlanDetail entry={selected} scope={scope}/></div>:<Surface title="طرح در دسترس نیست"><EmptyState title="این نسخهٔ منتشرشده برای محیط شما یافت نشد" description="طرح‌ها را دوباره بررسی کنید."/>;
  <Link className="c5-text-link" to="/billing/catalog">بازگشت به فهرست طرح‌ها</Link></Surface>;
 return <Surface title="مقایسه طرح‌ها" description="A02 — دوره‌های ماهانه، سه‌ماهه و سالانه مستقل هستند و قیمت ناموجود از دورهٔ دیگر محاسبه نمی‌شود.">
  {!plans.length?<EmptyState title="طرح منتشرشده‌ای وجود ندارد" description="هنوز طرح قابل خرید برای این نوع حساب منتشر نشده است."/>:
  <div className="c5-grid">{plans.map(entry=><article key={entry.version.id} className="c5-standalone">
   <div className="c5-row"><h3>{entry.plan.name}</h3><Badge tone="success">منتشرشده</Badge></div>
   <p>نسخهٔ {entry.version.version.toLocaleString('fa-IR')} · <bdi dir="ltr">{entry.plan.key}</bdi></p>
   <dl className="c5-nested">{PERIODS.map(period=><div key={period} className="c5-row" style={{padding:'8px 0',gap:7}}>
    <dt className="c5-muted">{PERIOD_LABELS[period]}</dt><dd style={{fontSize:12,fontWeight:800}}>{entry.prices[period]?toman(entry.prices[period]!.amount_toman):'دوره ناموجود'}</dd>
   </div>)}</dl>
   <div className="c5-actions"><Link className="c5-text-link" to={'/billing/plan/'+entry.version.id}>مشاهده جزئیات و انتخاب دوره</Link></div>
  </article>)}</div>}
 </Surface>;
}
