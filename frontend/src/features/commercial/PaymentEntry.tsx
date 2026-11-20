import React,{useRef} from 'react';
import {Link} from 'react-router-dom';
import {useMutation} from '@tanstack/react-query';
import {Button} from '../../shared/ui/Primitives';
import {commercialFlowsApi} from './commercialFlowsApi';
import {sandboxPaymentAllowed,sandboxRedirectAllowed} from './paymentRules';
import {ServerError} from './CommercialUi';
export function PaymentEntry({orderId,orderStatus,payable}:{orderId:number;orderStatus:string;payable:number}){
 const key=useRef('');
 const initiate=useMutation({mutationFn:()=>{if(!key.current)key.current=crypto.randomUUID();return commercialFlowsApi.initiatePayment(orderId,key.current);}});
 const sandboxFlag=import.meta.env.VITE_C5_SANDBOX_PAYMENTS==='true';
 const result=initiate.data?.data,redirect=sandboxRedirectAllowed(result?.payment.provider??'',result?.redirect_url??null,sandboxFlag);
 return <section className="c5-nested" aria-label="پرداخت سفارش">
  <h3>پرداخت سفارش</h3>
  <p className="c5-muted">صرفاً وضعیت گزارش‌شده توسط سرور، معتبر است. بازگشت از درگاه به معنی پرداخت موفق نیست.</p>
  {orderStatus==='in_review'&&<Button disabled={!sandboxPaymentAllowed(payable,sandboxFlag)||initiate.isPending||initiate.isSuccess} loading={initiate.isPending} onClick={()=>{
   if(window.confirm('درخواست پرداخت سفارش در سرور ثبت شود؟ استفاده از درگاه صرفاً در محیط آزمایشی مجاز است.'))initiate.mutate();
  }}>آغاز فرآیند پرداخت ({payable===0?'بدون نیاز به درگاه':'درگاه مجاز آزمایشی'})</Button>}
  {!sandboxPaymentAllowed(payable,sandboxFlag)&&<p className="c5-message c5-message--warning" role="status">آغاز پرداخت دارای مبلغ تا هنگام تأیید صریح محیط آزمایشی غیرفعال است. تنظیم VITE_C5_SANDBOX_PAYMENTS فقط در محیط آزمایش مجاز است.</p>}
  {initiate.isError&&<ServerError error={initiate.error}/>}
  {result&&<><p role="status">درخواست پرداخت ثبت شد؛ وضعیت: {result.payment.status}</p>
   <div className="c5-actions"><Link to={'/billing/payments/'+result.payment.id}>بررسی نتیجه از سرور</Link>
   {redirect&&<a href={redirect} rel="noopener noreferrer" target="_blank">نشانی امن ارائه‌دهنده (پنجره جدید)</a>}</div>
   {result.redirect_url&&!redirect&&<p role="alert">پیوند ارائه‌دهنده در محیط آزمایشی مجاز یا معتبر تشخیص داده نشد.</p>}
  </>}
  {orderStatus==='payable_pending'&&<p>یک فرآیند پرداخت برای این سفارش در جریان است. برای جلوگیری از درخواست تکراری، از وضعیت پرداخت قبلی پیگیری کنید.</p>}
  <p className="c5-muted">این رابط نمی‌تواند محیط آزمایشی بودن درگاه را از پاسخ فعلی اثبات کند؛ پیش از استفاده باید پیکربندی PSP جداگانه تأیید شود.</p>
 </section>;
}
