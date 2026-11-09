import React from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Button,Badge,LoadingState,EmptyState} from '../../shared/ui/Primitives';
import {dashboardApi,type SubscriptionLimit} from '../dashboard/dashboardApi';
import {type OwnerScope} from './commercialApi';
import {assessUsage} from './resourceStatus';
import {Surface,ServerError,Status,date,fa} from './CommercialPage';
export type SubscriptionSnapshot={state:string;plan:{key:string;version:number}|null;starts_at:string|null;expires_at:string|null;grace_ends_at:string|null;limits:SubscriptionLimit[]};
const humanResource=(key:string)=>{
 const labels:Record<string,string>={storage_bytes:'فضای ذخیره‌سازی',users:'کاربران',workspaces:'فضاهای کاری',projects:'پروژه‌ها',tasks:'وظایف'};
 return labels[key]??key;
};
const humanUsage=(limit:SubscriptionLimit,n:number)=>limit.resource_key==='storage_bytes'?
 fa(Math.round(n/(1024*1024)))+' مگابایت':fa(n);
function ResourceCard({limit}:{limit:SubscriptionLimit}){
 const condition=assessUsage(limit);
 const pct=condition==='unlimited'||condition==='unknown'||limit.limit_value===null||limit.limit_value<=0?null:
 Math.min(100,Math.round((limit.usage??0)/limit.limit_value*100));
 return <div className="c5-nested">
  <div className="c5-row"><strong style={{fontSize:12}}>{humanResource(limit.resource_key)}</strong>
   <Badge tone={condition==='over'?'danger':condition==='full'?'warning':condition==='unknown'?'neutral':'success'}>
    {condition==='over'?'بیش از سقف':condition==='full'?'تکمیل ظرفیت':condition==='unknown'?'مصرف نامشخص':condition==='unlimited'?'نامحدود':'در محدوده'}
   </Badge></div>
  <p className="c5-muted">{limit.usage===null?'مصرف نامشخص':humanUsage(limit,limit.usage)} از {limit.is_unlimited?'نامحدود':limit.limit_value===null?'سقف نامشخص':humanUsage(limit,limit.limit_value)}</p>
  {pct!==null&&<div className="c5-meter" role="progressbar" aria-label={'مصرف '+humanResource(limit.resource_key)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
   <span data-over={condition==='over'} style={{width:pct+'%'}}/></div>}
  {condition==='over'&&<p role="status" className="c5-over">طبق داده‌های سرور، مصرف این منبع از سقف مجاز بالاتر است. منابع موجود حذف نمی‌شوند؛ محدودیت ایجاد مورد جدید تابع سیاست سرور است.</p>}
 </div>;
}
export function SubscriptionPage({scope}:{scope:OwnerScope}){
 const q=useQuery({queryKey:['c5','subscription',scope.kind,scope.kind==='organization'?scope.organizationId:0],
  queryFn:()=>scope.kind==='personal'?dashboardApi.personalSummary():dashboardApi.organizationSummary(scope.organizationId),retry:false});
 if(q.isPending)return <Surface title="اشتراک و مصرف منابع"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 const summary=q.data?.data;
 const subscription:SubscriptionSnapshot|null|undefined=summary?.subscription;
 const pending=Boolean(summary?.pending_free_activation);
 const isMissing=!subscription||subscription.state==='missing';
 return <>
 <Surface title="اشتراک و منابع" description="A01 — وضعیت اشتراک و سهمیه‌های قابل‌تأیید بر اساس پاسخ زندهٔ سرور.">
  <div className="c5-grid c5-grid--two">
   <div className="c5-standalone"><div className="c5-row"><h3>اشتراک فعلی</h3>
    {pending&&isMissing?<Badge tone="warning">در انتظار فعال‌سازی رایگان</Badge>:subscription?<Status state={subscription.state}/>:<Badge tone="neutral">اطلاعات ناموجود</Badge>}</div>
    {isMissing?<p>{pending?'طرح رایگان پس از انتشار توسط مدیر سامانه به‌صورت خودکار فعال می‌شود. نیازی به پرداخت یا درخواست مجدد نیست.':'اشتراک فعال یا قابل‌مشاهده‌ای در پاسخ سرور وجود ندارد.'}</p>:
    <><p>طرح: <bdi dir="ltr">{subscription.plan?.key??'نامشخص'}</bdi> · نسخهٔ {fa(subscription.plan?.version)}</p>
     <p>شروع: {date(subscription.starts_at)}</p><p>پایان: {date(subscription.expires_at)}</p>
     {subscription.state==='grace'&&<p>پایان مهلت ارفاق: {date(subscription.grace_ends_at)}</p>}</>}
    <div className="c5-actions"><Link className="c5-text-link" to="/billing/catalog">مشاهدهٔ طرح‌های منتشرشده</Link></div>
   </div>
   <div className="c5-nested"><h3>دوره و امکان تمدید</h3>
    <p className="c5-muted">دورهٔ خرید (ماهانه، سه‌ماهه یا سالانه) در پاسخ Dashboard Summary ارائه نمی‌شود؛ بنابراین اینجا حدس زده نمی‌شود.</p>
    <p className="c5-muted">تمدید، ارتقای فوری، تنزل برنامه‌ریزی‌شده و پرداخت به APIهای M3/M4 نیاز دارند و هنوز فعال نیستند.</p>
    <Button variant="secondary" disabled title="API چرخهٔ خرید و تمدید شخصی/سازمانی هنوز تأیید نشده است">تمدید / تغییر طرح (غیرفعال)</Button>
   </div>
  </div>
 </Surface>
 <Surface title="مصرف منابع و سهمیه‌ها" description="برای هر منبع، مصرف و سقف عین پاسخ سرور است؛ مقدار ناشناخته صفر تلقی نمی‌شود.">
  {!subscription?<EmptyState title="مصرف در دسترس نیست" description="سرور اطلاعات اشتراک این محدوده را بازنگردانده است."/>:
  subscription.limits.length===0?<EmptyState title="سهمیه‌ای در این طرح تعریف نشده است" description="برای این طرح، فهرست محدودیت‌ها خالی است."/>:
  <div className="c5-grid c5-grid--two">{subscription.limits.map(limit=><ResourceCard key={limit.resource_key} limit={limit}/>)}</div>}
 </Surface>
 </>;
}
