import React,{useRef} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {Button,LoadingState,EmptyState,Badge} from '../../shared/ui/Primitives';
import {commercialApi,convertible,cancellable,owns,PERIOD_LABELS,toman,type Quote,type Order,type OwnerScope} from './commercialApi';
import {Surface,MoneyBreakdown,ServerError,Status,date,fa,useRemaining} from './CommercialPage';

function QuoteView({scope,id}:{scope:OwnerScope;id:number}){
 const navigate=useNavigate();
 const key=useRef<string>('');
 const query=useQuery({queryKey:['c5','quote',scope.kind,scope.kind==='organization'?scope.organizationId:0,id],queryFn:()=>commercialApi.quote(id),retry:false});
 const quote=query.data?.data.quote;
 const remaining=useRemaining(quote?.remaining_seconds);
 const convert=useMutation({mutationFn:async()=>{
  if(!quote||!convertible(quote)||remaining===0)throw new Error('اعتبار پیش‌فاکتور تمام شده است.');
  if(!key.current)key.current=crypto.randomUUID();
  return commercialApi.convertQuote(quote.id,key.current);
 },onSuccess:result=>navigate('/billing/orders/'+result.data.order.id),onError:()=>void query.refetch()});
 if(query.isPending)return <Surface title="بررسی پیش‌فاکتور"><LoadingState/></Surface>;
 if(query.isError)return <ServerError error={query.error} retry={()=>void query.refetch()}/>;
 if(!quote||!owns(quote,scope))return <ServerError error={new Error('پیش‌فاکتور یافت نشد یا قابل مشاهده نیست.')}/>;
 return <Surface title={'پیش‌فاکتور شماره '+fa(quote.id)} description="A04 — مقادیر مالی، تخفیف و مالیات عیناً از snapshot سرور ارائه می‌شوند.">
  <div className="c5-grid c5-grid--two">
   <section className="c5-nested"><div className="c5-row"><strong>وضعیت</strong><Status state={quote.status}/></div>
    <p className="c5-muted">طرح: {quote.plan?.name??'—'}</p><p className="c5-muted">دورهٔ خرید: {PERIOD_LABELS[quote.period]}</p>
    <p className="c5-muted">زمان انقضا: {date(quote.expires_at)}</p>
    <p className="c5-muted">زمان باقی‌مانده طبق پاسخ سرور: {fa(remaining)} ثانیه</p>
   </section>
   <MoneyBreakdown snapshot={quote}/>
  </div>
  {(!convertible(quote)||remaining===0)&&<div className="c5-message c5-message--warning" role="status">امکان تبدیل این پیش‌فاکتور وجود ندارد؛ مهلت یا وضعیت آن معتبر نیست.</div>}
  {convert.isError&&<ServerError error={convert.error} retry={()=>void query.refetch()}/>}
  <div className="c5-actions"><Button disabled={!convertible(quote)||remaining===0||convert.isPending} loading={convert.isPending} onClick={()=>convert.mutate()}>تبدیل به سفارش برای بررسی</Button>
   <Link className="c5-text-link" to="/billing/quotes">فهرست پیش‌فاکتورها</Link></div>
  <p className="c5-muted">تبدیل به سفارش به معنای پرداخت یا فعال‌شدن اشتراک نیست.</p>
 </Surface>;
}
function OrdersList({scope}:{scope:OwnerScope}){
 const q=useQuery({queryKey:['c5','orders',scope.kind,scope.kind==='organization'?scope.organizationId:0],queryFn:()=>commercialApi.orders(scope),retry:false});
 if(q.isPending)return <Surface title="سفارش‌های من"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 const list=q.data?.data.orders??[];
 return <Surface title="سفارش‌های ثبت‌شده" description="A05 — تاریخچه سفارش‌های قابل مشاهده برای همین مالک.">
  {!list.length?<EmptyState title="سفارشی ثبت نشده" description="پس از تبدیل پیش‌فاکتور معتبر، سفارش برای بررسی در اینجا نمایش داده می‌شود."/>:
  <div className="c5-table-scroll"><table className="c5-table"><thead><tr><th>سفارش</th><th>دوره</th><th>جمع نهایی</th><th>وضعیت</th><th>جزئیات</th></tr></thead><tbody>
   {list.filter(o=>owns(o,scope)).map(o=><tr key={o.id}><td>{fa(o.id)}</td><td>{PERIOD_LABELS[o.period]}</td><td>{toman(o.total_toman)}</td><td><Status state={o.status}/></td><td><Link className="c5-text-link" to={'/billing/orders/'+o.id}>بررسی</Link></td></tr>)}
  </tbody></table></div>}
 </Surface>;
}
function QuotesList({scope}:{scope:OwnerScope}){
 const q=useQuery({queryKey:['c5','quotes',scope.kind,scope.kind==='organization'?scope.organizationId:0],queryFn:()=>commercialApi.quotes(scope),retry:false});
 if(q.isPending)return <Surface title="پیش‌فاکتورهای من"><LoadingState/></Surface>;
 if(q.isError)return <ServerError error={q.error} retry={()=>void q.refetch()}/>;
 const list=q.data?.data.quotes??[];
 return <Surface title="پیش‌فاکتورهای اخیر" description="فقط پیش‌فاکتورهای متعلق به این حساب نمایش داده می‌شوند.">
  {!list.length?<EmptyState title="پیش‌فاکتوری وجود ندارد" description="از فهرست طرح‌ها پیش‌فاکتور ایجاد کنید."/>:
  <div className="c5-table-scroll"><table className="c5-table"><thead><tr><th>شناسه</th><th>طرح</th><th>دوره</th><th>مبلغ نهایی</th><th>وضعیت</th><th>جزئیات</th></tr></thead><tbody>
   {list.filter(q=>owns(q,scope)).map(quote=><tr key={quote.id}><td>{fa(quote.id)}</td><td>{quote.plan?.name??'—'}</td><td>{PERIOD_LABELS[quote.period]}</td><td>{toman(quote.total_toman)}</td><td><Status state={quote.status}/></td><td><Link className="c5-text-link" to={'/billing/quotes/'+quote.id}>بررسی</Link></td></tr>)}
  </tbody></table></div>}
 </Surface>;
}
function OrderView({scope,id}:{scope:OwnerScope;id:number}){
 const qc=useQueryClient();
 const query=useQuery({queryKey:['c5','order',scope.kind,scope.kind==='organization'?scope.organizationId:0,id],queryFn:()=>commercialApi.order(id),retry:false});
 const order=query.data?.data.order;
 const remaining=useRemaining(order?.review_remaining_seconds);
 const mutation=useMutation({mutationFn:()=>commercialApi.cancelOrder(id),onSuccess:()=>{void query.refetch();void qc.invalidateQueries({queryKey:['c5','orders']});}});
 if(query.isPending)return <Surface title="مرور سفارش"><LoadingState/></Surface>;
 if(query.isError)return <ServerError error={query.error} retry={()=>void query.refetch()}/>;
 if(!order||!owns(order,scope))return <ServerError error={new Error('سفارش یافت نشد یا قابل مشاهده نیست.')}/>;
 return <Surface title={'مرور سفارش شماره '+fa(order.id)} description="A05 — سفارش ایجادشده از پیش‌فاکتور؛ تأیید پرداخت در این مرحله وجود ندارد.">
  <div className="c5-grid c5-grid--two"><section className="c5-nested">
   <div className="c5-row"><strong>وضعیت سفارش</strong><Status state={order.status}/></div>
   <p className="c5-muted">دورهٔ خرید: {PERIOD_LABELS[order.period]}</p>
   <p className="c5-muted">مهلت مرور: {date(order.review_expires_at)}</p>
   <p className="c5-muted">باقی‌مانده طبق پاسخ سرور: {fa(remaining)} ثانیه</p>
  </section><MoneyBreakdown snapshot={order}/></div>
  {order.lines.length>0&&<div className="c5-nested" style={{marginTop:17}}>
   <h3 style={{fontSize:13,fontWeight:850}}>اقلام ثبت‌شده در سفارش</h3>
   <div className="c5-table-scroll"><table className="c5-table"><thead><tr><th>شرح</th><th>نوع</th><th>مبلغ</th></tr></thead><tbody>
    {order.lines.map(line=><tr key={line.id}><td>{line.description}</td><td>{line.kind}</td><td>{toman(line.amount_toman)}</td></tr>)}
   </tbody></table></div></div>}
  {!cancellable(order)||remaining===0?<div className="c5-message c5-message--warning">در وضعیت فعلی، لغو یا ادامهٔ بررسی این سفارش مجاز نیست.</div>:null}
  {mutation.isError&&<ServerError error={mutation.error} retry={()=>void query.refetch()}/>}
  <div className="c5-actions"><Button variant="danger" disabled={!cancellable(order)||remaining===0||mutation.isPending} loading={mutation.isPending}
   onClick={()=>{if(window.confirm('این سفارش هنوز پرداخت نشده است. آیا لغو شود؟'))mutation.mutate();}}>لغو سفارش</Button>
   <Link className="c5-text-link" to="/billing/orders">بازگشت به فهرست سفارش‌ها</Link></div>
  <div className="c5-message c5-message--warning" role="status">پرداخت فعال نیست. سفارش برای بررسی ایجاد شده و اشتراک شما تغییر نکرده است.</div>
 </Surface>;
}
export function CommercialRecords({scope}:{scope:OwnerScope}){
 const path=useLocation().pathname;
 const id=Number(path.split('/').pop());
 if(path==='/billing/quotes')return <QuotesList scope={scope}/>;
 if(path==='/billing/orders')return <OrdersList scope={scope}/>;
 if(path.startsWith('/billing/quotes/')&&Number.isSafeInteger(id)&&id>0)return <QuoteView key={id} id={id} scope={scope}/>;
 if(path.startsWith('/billing/orders/')&&Number.isSafeInteger(id)&&id>0)return <OrderView key={id} id={id} scope={scope}/>;
 return <Surface title="صفحه‌ای یافت نشد"><EmptyState title="مسیر مالی معتبر نیست" description="یکی از صفحات ثبت‌شده را از نوار بالا انتخاب کنید."/></Surface>;
}
