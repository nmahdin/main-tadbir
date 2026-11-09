import React,{useState} from 'react';
import {useLocation,useSearchParams} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button,Badge,EmptyState,LoadingState} from '../../shared/ui/Primitives';
import {commercialApi,PERIODS,PERIOD_LABELS,toman,type Period,type Promotion,type TaxRule,type VersionPrice} from './commercialApi';
import {Surface,ServerError,Status,date,fa} from './CommercialPage';

function PriceVersion({version,planKey}:{version:VersionPrice;planKey:string}){
 const cache=useQueryClient();
 const [input,setInput]=useState<Record<Period,string>>({monthly:'',quarterly:'',annual:''});
 const changes=Object.fromEntries(PERIODS.filter(p=>input[p].trim()!=='').map(p=>[p,Number(input[p])])) as Partial<Record<Period,number>>;
 const valid=Object.keys(changes).length>0&&Object.values(changes).every(v=>Number.isSafeInteger(v)&&v!==undefined&&v>=0);
 const mutation=useMutation({mutationFn:()=>commercialApi.publishPrices(version.id,changes),onSuccess:()=>{
  void cache.invalidateQueries({queryKey:['c5','platform-prices',planKey]});
 }});
 const published=version.published_at!==null;
 return <article className="c5-standalone">
  <div className="c5-row"><h3>نسخهٔ {fa(version.version)}</h3>{published?<Badge tone="success">منتشر شده</Badge>:<Badge tone="warning">پیش‌نویس نسخه</Badge>}</div>
  <p>زمان انتشار: {date(version.published_at)}</p>
  <div className="c5-nested">{PERIODS.map(period=><div key={period} className="c5-row" style={{padding:6}}>
   <span className="c5-muted">{PERIOD_LABELS[period]}</span><strong style={{fontSize:12}}>{version.prices[period]?toman(version.prices[period]!.amount_toman):'قیمت منتشرنشده'}</strong></div>)}</div>
  {!published&&<>
   <p className="c5-muted">A10 — قیمت‌های هر دوره مستقل‌اند. خالی گذاشتن دوره به معنی عدم انتشار آن دوره است.</p>
   <div className="c5-form">{PERIODS.map(p=><label key={p}>{PERIOD_LABELS[p]}، تومان (اختیاری)
    <input type="number" min="0" step="1" inputMode="numeric" value={input[p]} placeholder="بدون انتشار" onChange={e=>{setInput({...input,[p]:e.target.value});mutation.reset();}}/>
   </label>)}</div>
   {mutation.isError&&<ServerError error={mutation.error}/>}
   {mutation.isSuccess&&<div role="status" className="c5-message">قیمت‌ها در سرور منتشر شدند؛ نسخه دیگر قابل ویرایش نیست.</div>}
   <div className="c5-actions"><Button disabled={!valid||mutation.isPending||mutation.isSuccess} loading={mutation.isPending} onClick={()=>{
    if(window.confirm('انتشار قیمت‌های این نسخه غیرقابل بازگشت است. ادامه می‌دهید؟'))mutation.mutate();
   }}>انتشار قیمت‌های منتخب</Button></div>
  </>}
  {published&&<p className="c5-muted">نسخهٔ منتشرشده تغییرناپذیر است؛ ایجاد نسخهٔ جدید API تأییدشده ندارد.</p>}
 </article>;
}
function PlanAdmin(){
 const [params,setParams]=useSearchParams();
 const catalog=useQuery({queryKey:['c5','catalog'],queryFn:commercialApi.catalog,retry:false});
 const plans=catalog.data?.data.plans??[];
 const key=params.get('plan')||plans[0]?.plan.key||'';
 const versions=useQuery({queryKey:['c5','platform-prices',key],queryFn:()=>commercialApi.prices(key),enabled:Boolean(key),retry:false});
 if(catalog.isPending)return <Surface title="مدیریت طرح‌ها"><LoadingState/></Surface>;
 if(catalog.isError)return <ServerError error={catalog.error} retry={()=>void catalog.refetch()}/>;
 return <>
 <Surface title="مدیریت طرح‌ها" description="A09 — نمای طرح‌های دارای قیمت منتشرشده. ساخت نسخه/طرح در C5-M2 API تأییدشده ندارد.">
  <div className="c5-row"><div className="c5-form" style={{minWidth:240}}><label>طرح
   <select aria-label="انتخاب طرح برای مدیریت قیمت" value={key} disabled={!plans.length} onChange={e=>setParams({plan:e.target.value})}>
    {plans.map(entry=><option key={entry.plan.id} value={entry.plan.key}>{entry.plan.name} ({entry.plan.key})</option>)}
   </select></label></div>
   <Button variant="secondary" disabled title="API ساخت نسخهٔ جدید تأیید نشده است">ایجاد نسخهٔ جدید (غیرفعال)</Button></div>
  <p className="c5-muted">طرح‌های پیش‌نویس که در کاتالوگ منتشرشده نیستند ممکن است در این فهرست ظاهر نشوند؛ endpoint فهرست کامل طرح‌ها تأیید نشده است.</p>
 </Surface>
 {!key?<Surface><EmptyState title="طرح قیمت‌گذاری‌شده‌ای پیدا نشد" description="پس از انتشار اولین قیمت، طرح در کاتالوگ قابل مشاهده خواهد بود."/></Surface>:
 versions.isPending?<Surface><LoadingState/></Surface>:versions.isError?
 <ServerError error={versions.error} retry={()=>void versions.refetch()}/>:
 <Surface title={'قیمت‌های طرح '+(versions.data?.data.plan.name??key)} description="A10 — انتشار قیمت فقط برای نسخهٔ پیش‌نویس مجاز است؛ مبلغ نهایی در سرور ثبت می‌شود.">
  {!versions.data?.data.versions.length?<EmptyState title="نسخه‌ای یافت نشد"/>:<div className="c5-grid c5-grid--two">{versions.data.data.versions.map(v=><div key={v.id}><PriceVersion version={v} planKey={key}/></div>)}</div>}
 </Surface>}
 </>;
}
function TaxAdmin(){
 const cache=useQueryClient();
 const q=useQuery({queryKey:['c5','taxes'],queryFn:commercialApi.taxes,retry:false});
 const [label,setLabel]=useState(''),[rate,setRate]=useState('1000'),[activate,setActivate]=useState(false);
 const create=useMutation({mutationFn:()=>commercialApi.createTax({label:label.trim(),rate_basis_points:Number(rate),activate}),onSuccess:()=>{setLabel('');void cache.invalidateQueries({queryKey:['c5','taxes']});}});
 const toggle=useMutation({mutationFn:(rule:TaxRule)=>rule.is_active?commercialApi.deactivateTax(rule.id):commercialApi.activateTax(rule.id),onSuccess:()=>void cache.invalidateQueries({queryKey:['c5','taxes']})});
 if(q.isPending)return <Surface title="مالیات"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 return <Surface title="قوانین مالیات" description="مبنای رسمی سرور basis points است: ۱۰۰۰ واحد معادل ۱۰٪ است. این صفحه مبلغ سفارش را محاسبه نمی‌کند.">
  <div className="c5-grid c5-grid--two">
   <div className="c5-nested"><h3>قانون جدید</h3><div className="c5-form">
    <label>عنوان<input value={label} maxLength={120} onChange={e=>setLabel(e.target.value)}/></label>
    <label>نرخ به واحد ده‌هزارم<input type="number" min="0" max="10000" step="1" value={rate} onChange={e=>setRate(e.target.value)}/></label>
    <label style={{display:'flex',alignItems:'center'}}><input type="checkbox" checked={activate} onChange={e=>setActivate(e.target.checked)}/> فعال‌سازی پس از ثبت</label>
    <Button disabled={!label.trim()||!Number.isInteger(Number(rate))||Number(rate)<0||Number(rate)>10000||create.isPending} loading={create.isPending} onClick={()=>create.mutate()}>ثبت قانون</Button>
    {create.isError&&<ServerError error={create.error}/>}</div></div>
   <div className="c5-nested"><h3>قوانین ثبت‌شده</h3>{!q.data?.data.rules.length?<EmptyState title="قانونی ثبت نشده"/>:
    <div>{q.data.data.rules.map(rule=><div key={rule.id} className="c5-row" style={{borderBottom:'1px solid #e5edf0',padding:10}}>
     <div><strong style={{fontSize:12}}>{rule.label}</strong><p className="c5-muted">نرخ: {fa(rule.rate_basis_points)} / ۱۰٬۰۰۰</p></div>
     <div><Badge tone={rule.is_active?'success':'neutral'}>{rule.is_active?'فعال':'غیرفعال'}</Badge>
      <Button variant="secondary" disabled={toggle.isPending} onClick={()=>{if(window.confirm('وضعیت این قانون تغییر کند؟'))toggle.mutate(rule);}}>{rule.is_active?'غیرفعال‌سازی':'فعال‌سازی'}</Button></div>
    </div>)}</div>}
    {toggle.isError&&<ServerError error={toggle.error}/>}</div>
  </div>
 </Surface>;
}
function PromotionAdmin(){
 const cache=useQueryClient();const q=useQuery({queryKey:['c5','promotions'],queryFn:commercialApi.promotions,retry:false});
 const [code,setCode]=useState(''),[label,setLabel]=useState(''),[kind,setKind]=useState<'percent'|'fixed'>('percent'),[value,setValue]=useState('');
 const create=useMutation({mutationFn:()=>commercialApi.createPromo({code:code.trim(),label:label.trim(),discount_type:kind,
  ...(kind==='percent'?{discount_value_bp:Number(value)}:{discount_value_toman:Number(value)})}),onSuccess:()=>{
   setCode('');setLabel('');setValue('');void cache.invalidateQueries({queryKey:['c5','promotions']});
  }});
 const disable=useMutation({mutationFn:(p:Promotion)=>commercialApi.deactivatePromo(p.id),onSuccess:()=>void cache.invalidateQueries({queryKey:['c5','promotions']})});
 if(q.isPending)return <Surface title="کدهای تخفیف"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 return <Surface title="کدهای تخفیف" description="کد تخفیف فقط هنگام صدور پیش‌فاکتور ارزیابی می‌شود. هیچ نتیجهٔ مالی در مرورگر محاسبه نمی‌شود.">
  <div className="c5-grid c5-grid--two">
   <div className="c5-nested"><h3>کد جدید</h3><div className="c5-form">
    <label>کد<input maxLength={32} value={code} onChange={e=>setCode(e.target.value)}/></label>
    <label>عنوان<input maxLength={120} value={label} onChange={e=>setLabel(e.target.value)}/></label>
    <label>نوع تخفیف<select value={kind} onChange={e=>setKind(e.target.value as 'percent'|'fixed')}><option value="percent">درصد، واحد ده‌هزارم</option><option value="fixed">مبلغ ثابت، تومان</option></select></label>
    <label>مقدار<input type="number" min="0" step="1" value={value} onChange={e=>setValue(e.target.value)}/></label>
    <Button disabled={!code.trim()||!label.trim()||!value.trim()||!Number.isSafeInteger(Number(value))||Number(value)<0||(kind==='percent'&&Number(value)>10000)||create.isPending} loading={create.isPending} onClick={()=>create.mutate()}>ثبت کد تخفیف</Button>
    {create.isError&&<ServerError error={create.error}/>}</div></div>
   <div className="c5-nested"><h3>کدهای تعریف‌شده</h3>{!q.data?.data.promotions.length?<EmptyState title="کدی ثبت نشده"/>:
    <div>{q.data.data.promotions.map(p=><div key={p.id} className="c5-row" style={{borderBottom:'1px solid #e5edf0',padding:10}}>
     <div><strong style={{fontSize:12}}><bdi dir="ltr">{p.code}</bdi></strong><p className="c5-muted">{p.label}</p>
      <p className="c5-muted">{p.discount_type==='fixed'?toman(p.discount_value_toman):fa(p.discount_value_bp)+' واحد ده‌هزارم'}</p></div>
     <div><Badge tone={p.is_active?'success':'neutral'}>{p.is_active?'فعال':'غیرفعال'}</Badge>
      <Button variant="secondary" disabled={!p.is_active||disable.isPending} onClick={()=>{if(window.confirm('کد تخفیف غیرفعال شود؟'))disable.mutate(p);}}>غیرفعال‌سازی</Button></div>
    </div>)}</div>}
    {disable.isError&&<ServerError error={disable.error}/>}</div>
  </div>
 </Surface>;
}
export function PlatformCommerce(){
 const path=useLocation().pathname;
 if(path==='/billing/platform/taxes')return <TaxAdmin/>;
 if(path==='/billing/platform/promotions')return <PromotionAdmin/>;
 if(path==='/billing/platform'||path==='/billing')return <PlanAdmin/>;
 return <Surface title="صفحهٔ نامعتبر"><EmptyState title="بخش مدیریت مالی یافت نشد"/></Surface>;
}
