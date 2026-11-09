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
import {Surface,ServerError} from './CommercialUi';
import './commercial.css';
import './subscription.css';

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
