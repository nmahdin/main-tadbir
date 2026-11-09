import React,{useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useEnvironment} from '../../app/providers/EnvironmentContext';
import {useAuth} from '../../app/providers/AuthContext';
import {Button,Badge,LoadingState,EmptyState,ErrorState} from '../../shared/ui/Primitives';
import {billingAccess,type Access} from './billingAccess';
import {PERIODS,PERIOD_LABELS,toman,type Period,type AmountSnapshot} from './commercialApi';
import {formatPersianDate} from '../../shared/lib/date';
import {parseApiError} from '../../shared/api/errors';
import {CommercialCatalog} from './CommercialCatalog';
import {CommercialRecords} from './CommercialRecords';
import {PlatformCommerce} from './PlatformCommerce';
import {SubscriptionPage} from './SubscriptionPage';
import './commercial.css';
import './subscription.css';

export const fa=(v:number|null|undefined)=>v===null||v===undefined?'—':v.toLocaleString('fa-IR');
export const date=(v:string|null|undefined)=>v?formatPersianDate(v):'—';
export function useRemaining(seconds:number|undefined){
 const [started,setStarted]=useState(()=>Date.now()),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{setStarted(Date.now());setNow(Date.now());},[seconds]);
 useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t);},[]);
 return Math.max(0,Math.floor((seconds??0)-Math.max(0,now-started)/1000));
}
export function ServerError({error,retry}:{error:unknown;retry?:()=>void}){
 const issue=parseApiError(error);
 const message=issue.status===409?'این درخواست با وضعیت فعلی سازگار نیست؛ اطلاعات را تازه‌سازی کنید.':
 issue.status===403?'برای مشاهده یا انجام این عملیات مجوز ندارید.':
 issue.status===404?'مورد درخواستی یافت نشد یا به آن دسترسی ندارید.':
 issue.status===422?'اطلاعات این درخواست مورد پذیرش سرور نبود.':
 issue.message;
 return <div role="alert" className="c5-message c5-message--error"><strong>{message}</strong>
  {retry&&<Button variant="secondary" onClick={retry}>تلاش دوباره</Button>}
 </div>;
}
export function MoneyBreakdown({snapshot}:{snapshot:AmountSnapshot}){
 return <dl className="c5-breakdown">
  <dt>مبلغ پایه</dt><dd>{toman(snapshot.subtotal_toman)}</dd>
  <dt>تخفیف</dt><dd>{toman(snapshot.discount_toman)}</dd>
  <dt>مالیات</dt><dd>{toman(snapshot.tax_toman)}</dd>
  <dt className="c5-breakdown-total">مبلغ نهایی سرور</dt><dd className="c5-breakdown-total">{toman(snapshot.total_toman)}</dd>
 </dl>;
}
export function Surface({title,description,children}:{title?:string;description?:string;children:React.ReactNode}){
 return <section className="c5-surface">{title&&<header className="c5-surface-head"><h2>{title}</h2>{description&&<p>{description}</p>}</header>}{children}</section>;
}
export function Status({state}:{state:string}){
 const names:Record<string,string>={active:'فعال',grace:'دورهٔ ارفاق',expired:'منقضی',not_started:'هنوز آغاز نشده',missing:'بدون اشتراک',open:'آمادهٔ بررسی',superseded:'جایگزین شده',converted:'تبدیل شده',in_review:'در انتظار بررسی',cancelled:'لغو شده',review_expired:'مهلت بررسی تمام شده',draft:'پیش‌نویس'};
 return <Badge tone={['active','open','in_review'].includes(state)?'success':['grace','not_started'].includes(state)?'warning':['expired','review_expired','cancelled'].includes(state)?'danger':'neutral'}>{names[state]||state}</Badge>;
}
export function PeriodSelect({value,onChange,available}:{value:Period;onChange:(v:Period)=>void;available:Record<Period,{amount_toman:number}|null>}){
 return <div className="c5-periods" role="group" aria-label="انتخاب دورهٔ خرید">{PERIODS.map(period=><button type="button" key={period} aria-pressed={value===period}
  disabled={!available[period]} onClick={()=>onChange(period)}>{PERIOD_LABELS[period]}<small>{available[period]?toman(available[period].amount_toman):'ناموجود'}</small></button>)}</div>;
}
export function CommercialPage(){
 const {current,payload,isLoading}=useEnvironment();
 const {isLoggedIn}=useAuth();
 const location=useLocation();
 const access=billingAccess(current,payload);
 if(!isLoggedIn)return <div className="c5"><ServerError error={new Error('ابتدا وارد حساب خود شوید.')} /></div>;
 if(isLoading)return <div className="c5"><LoadingState/></div>;
 if(access.area==='forbidden')return <div className="c5" dir="rtl"><Surface title="دسترسی مالی در این محیط موجود نیست"><p className="c5-muted">{access.reason}</p><Link className="c5-text-link" to="/select-environment">انتخاب محیط مجاز</Link></Surface></div>;
 const isPlatform=access.area==='platform';
 const path=location.pathname;
 const tabs=isPlatform?[
  ['/billing/platform','مدیریت طرح‌ها'],['/billing/platform/taxes','قوانین مالیات'],['/billing/platform/promotions','کدهای تخفیف']
 ]:[
  ['/billing/subscription','اشتراک و منابع'],['/billing/catalog','انتخاب طرح'],['/billing/quotes','پیش‌فاکتورها'],['/billing/orders','سفارش‌ها']
 ];
 const view=isPlatform?<PlatformCommerce/>:path==='/billing/subscription'||path==='/billing'?
  <SubscriptionPage scope={access.scope}/>:path==='/billing/catalog'||path.startsWith('/billing/plan/')?
  <CommercialCatalog scope={access.scope}/>:<CommercialRecords scope={access.scope}/>;
 return <section className="c5" dir="rtl" aria-label="امور مالی تدبیر">
  <header className="c5-heading"><div><p>تدبیر / امور مالی</p><h1>{isPlatform?'مدیریت طرح‌ها و قیمت‌ها':'اشتراک و خرید طرح'}</h1>
   <span>{access.label} · اطلاعات واقعی از سرور تدبیر</span></div><Badge tone="neutral">Ocean / C5</Badge></header>
  <nav className="c5-tabs" aria-label="بخش‌های امور مالی">{tabs.map(([to,title])=><Link key={to} aria-current={path===to?'page':undefined} to={to}>{title}</Link>)}</nav>
  {view}
  <p className="c5-disclaimer">صدور پیش‌فاکتور و سفارش به معنی پرداخت، فعال‌شدن اشتراک یا برداشت وجه نیست. مرحلهٔ پرداخت هنوز فعال نشده است.</p>
 </section>;
}
