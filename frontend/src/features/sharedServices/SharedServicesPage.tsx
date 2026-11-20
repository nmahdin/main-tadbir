import React from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useEnvironment} from '../../app/providers/EnvironmentContext';
import {ActionInbox} from './ActionInbox';
import {SystemMessages} from './SystemMessages';
import {SupportDesk} from './SupportDesk';
import {SharedPanel,SharedEmpty} from './SharedServicesUi';
export function SharedServicesPage(){
 const {current,payload,isLoading}=useEnvironment();
 const path=useLocation().pathname;
 const platform=Boolean(current?.kind==='platform'&&payload?.platform.eligible);
 const messageAdmin=Boolean(platform&&payload?.platform.permissions.includes('platform.messages.manage'));
 const supportAgent=Boolean(platform&&(payload?.platform.permissions.includes('platform.support.agent')||payload?.platform.permissions.includes('platform.support.manage')));
 const isAdminMessages=path.startsWith('/shared-services/messages/admin');
 const isSupportQueue=path.startsWith('/shared-services/support/queue');
 const eligible=!isLoading&&current!==null&&(!isAdminMessages||messageAdmin)&&(!isSupportQueue||supportAgent);
 const entries=[['/shared-services/inbox','کارتابل اقدامات'],['/shared-services/messages','پیام‌های رسمی'],['/shared-services/support','پشتیبانی من']];
 if(messageAdmin)entries.push(['/shared-services/messages/admin','مدیریت پیام‌های رسمی']);
 if(supportAgent)entries.push(['/shared-services/support/queue','صف پشتیبانی پلتفرم']);
 return <section dir="rtl" className="mx-auto max-w-7xl px-3 py-5 sm:p-6 space-y-5" aria-label="خدمات مشترک سامانه">
  <header><p className="text-sm text-slate-500">تدبیر / خدمات مشترک</p><h1 className="text-2xl font-extrabold text-slate-900">کارتابل، پیام‌های رسمی و پشتیبانی</h1></header>
  <nav className="flex flex-wrap gap-2" aria-label="بخش‌های خدمات مشترک">{entries.map(([to,label])=><Link key={to} to={to} aria-current={path===to||path.startsWith(to+'/')?'page':undefined} className={'rounded-xl border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 '+(path===to||path.startsWith(to+'/')?'border-[#39677C] bg-[#EAF1F5] text-[#39677C]':'border-slate-200 bg-white text-slate-700')}>{label}</Link>)}</nav>
  {isLoading?<SharedPanel title="بارگذاری"><SharedEmpty message="در حال بررسی محیط و دسترسی…"/></SharedPanel>:
  !eligible?<SharedPanel title="دسترسی محدود"><SharedEmpty message="این بخش برای محیط یا مجوز انتخابی فعال نیست. دسترسی نهایی توسط سرور کنترل می‌شود."/></SharedPanel>:
  path.startsWith('/shared-services/inbox')?<ActionInbox/>:
  path.startsWith('/shared-services/messages')?<SystemMessages/>:
  path.startsWith('/shared-services/support')?<SupportDesk/>:
  <SharedPanel title="مسیر ناشناخته"><SharedEmpty message="صفحه خدمات مشترک یافت نشد."/></SharedPanel>}
 </section>;
}
