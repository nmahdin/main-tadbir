import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity,AlertCircle,ArrowLeft,ArrowRight,Bell,BookOpen,CalendarDays,CheckCircle2,ChevronLeft,ChevronRight,ClipboardList,Clock3,Download,FileText,FolderKanban,Info,Layers3,ListTodo,LoaderCircle,LockKeyhole,Mail,MessageSquare,MoreHorizontal,Palette,Plus,Search,Settings2,ShieldCheck,Sparkles,UserRound,X, type LucideIcon} from 'lucide-react';
import {Button,IconButton,Input,Textarea,Select,SearchInput,Card,Badge,Checkbox,RadioGroup,FormField,Table,TableRow,TableCell,Tabs,LoadingState,CardSkeleton,TableSkeleton,EmptyState,ErrorState,Modal,Drawer,PageHeader} from '../../../shared/ui/Primitives';
import {Alert,toast} from '../../../shared/ui/Notifications';
import {Tooltip,Popover,DropdownMenu} from '../../../shared/ui/Overlays';
import {DatePicker} from '../../../shared/ui/DatePicker';
import {STUDIO_GROUPS,STUDIO_PAGES,studioPath} from './studioRoutes';

function DemoSection({title,description,children,flat=false}:{title:string;description?:string;children:React.ReactNode;flat?:boolean}){
 return <section className={'ods-demo-surface '+(flat?'ods-demo-surface--flat':'')}>
  <header className="ods-demo-surface-head"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div><span className="ods-surface-label">OCEAN</span></header>
  <div className="ods-demo-surface-body">{children}</div>
 </section>;
}
function Note({children}:{children:React.ReactNode}){return <p className="ods-explainer">{children}</p>;}
const sourceColors=[
 ['رنگ اصلی','#39677C','Primary'],['هاور اصلی','#2B5266','Hover'],['پس‌زمینه','#F5F9FA','Canvas'],
 ['سفید کارت','#FFFFFF','Surface'],['حاشیه','#E2E9EC','Border'],['آبی مکمل','#7296A8','Accent'],
 ['اطلاعات','#DCEAF0','Info surface'],['موفقیت','#358D47','Success'],['هشدار','#D46D25','Warning'],['خطر','#BC2424','Danger']
];
const iconList:{title:string;icon:LucideIcon}[]=[
 {title:'پیشخوان',icon:FolderKanban},{title:'فعالیت',icon:Activity},{title:'وظایف',icon:ListTodo},
 {title:'پیام‌ها',icon:MessageSquare},{title:'اعلان',icon:Bell},{title:'تنظیمات',icon:Settings2},
 {title:'گزارش',icon:FileText},{title:'کاربر',icon:UserRound},{title:'امنیت',icon:ShieldCheck},
 {title:'تقویم',icon:CalendarDays},{title:'اطلاعات',icon:Info},{title:'جست‌وجو',icon:Search}
];
function ColorsPage(){return <>
 <DemoSection title="رنگ‌های پایه و معنایی" description="پالت مرجع Ocean؛ از رنگ‌ها برای معنای مشخص استفاده کنید.">
  <div className="ods-swatch-grid">{sourceColors.map(([label,color,role])=><div className="ods-swatch" key={color}>
    <div className="ods-swatch-color" style={{backgroundColor:color}}/>
    <strong>{label}</strong><small>{role}</small><code dir="ltr">{color}</code>
   </div>)}</div>
 </DemoSection>
 <DemoSection title="نشانه‌های وضعیت" flat><div className="ods-demo-row">
  <Badge tone="success">تأییدشده</Badge><Badge tone="warning">در انتظار</Badge><Badge tone="danger">خطا</Badge><Badge tone="info">اطلاع‌رسانی</Badge><Badge tone="neutral">پیش‌نویس</Badge>
 </div><Note>معنای وضعیت تنها با رنگ منتقل نشود؛ متن و آیکن نیز لازم است.</Note></DemoSection>
 </>;}
function TypographyPage(){return <>
 <DemoSection title="سلسله‌مراتب متنی" description="فونت Vazirmatn در بستهٔ فرانت‌اند قرار دارد و وابسته به CDN نیست.">
  <div className="ods-type-stack">
   <h1>عنوان اصلی صفحه — پیشخوان سازمان</h1>
   <h2>عنوان بخش — فعالیت‌های اخیر</h2>
   <h3>عنوان کارت — گزارش پروژه‌ها</h3>
   <p>متن بدنهٔ فارسی با فاصلهٔ سطر مناسب برای خواندن فرم‌ها، جداول و گزارش‌های طولانی.</p>
   <small>متن راهنما — در این بخش فقط از داده‌های نمونه استفاده شده است.</small>
  </div>
 </DemoSection>
 <DemoSection title="اعداد، شناسه‌ها و ترکیب جهت" flat><p>کد رهگیری: <bdi dir="ltr">REQ-2026-0048</bdi></p>
  <p>ایمیل نمونه: <bdi dir="ltr">support@example.com</bdi></p><Note>شناسه‌های لاتین را از جهت پاراگراف فارسی جدا نگه دارید.</Note>
 </DemoSection></>;}
function SpacingPage(){const sizes=[4,8,12,16,20,24,32,40,48];return <>
 <DemoSection title="فواصل منظم" description="نمونهٔ ریتم فاصله‌ها از ۴ تا ۴۸ پیکسل.">
  <div className="ods-spacing-list">{sizes.map(n=><div key={n}><span>{n}px</span><span className="ods-spacing-bar" style={{width:n*4}}/><small>{n===12?'فاصلهٔ کنترل‌ها':n===24?'فاصلهٔ سطوح':'نمونهٔ گرید'}</small></div>)}</div>
 </DemoSection><DemoSection title="چیدمان واکنش‌گرا" flat>
  <div className="ods-spacing-cards">{[1,2,3].map(n=><div key={n}>ماژول {n.toLocaleString('fa-IR')}</div>)}</div>
  <Note>فاصله‌های منطقی RTL و شبکه‌های واکنش‌گرا از عرض واقعی محتوا پیروی می‌کنند.</Note>
 </DemoSection></>;}
function RadiusPage(){const [selected,setSelected]=useState<24|28>(24);return <>
 <DemoSection title="مقایسهٔ هندسهٔ اصلی — ۲۴ در برابر ۲۸ پیکسل" description="این پیشنهاد تنها در استودیو نمایش داده می‌شود؛ هیچ توکن سراسری تغییر نکرده است." flat>
  <div className="ods-radius-grid">
   <article className="ods-radius-panel ods-radius-panel--current" data-testid="studio-radius-24">
    <span className="ods-radius-chip">مصوب · Amendment C</span><h3>سطح اصلی ۲۴px</h3>
    <p>کادر سفید با گوشه‌های گرد و سایهٔ ثابت مطابق Amendment B.</p>
    <div className="ods-radius-nested">پنل داخلی ۱۶px · بدون سایه</div>
   </article>
   <article className="ods-radius-panel ods-radius-panel--proposal" data-testid="studio-radius-28">
    <span className="ods-radius-chip ods-radius-chip--proposal">پیشنهاد · فقط در Studio</span><h3>سطح اصلی ۲۸px</h3>
    <p>گردی اندکی بیشتر، با همان سایهٔ ظریف و بدون افزایش هنگام Hover.</p>
    <div className="ods-radius-nested">پنل داخلی ۱۶px · بدون سایه</div>
   </article>
  </div>
  <div className="ods-radius-chooser" role="group" aria-label="انتخاب نمونهٔ اصلی">
    <Button variant={selected===24?'primary':'secondary'} onClick={()=>setSelected(24)} aria-pressed={selected===24}>۲۴px فعلی</Button>
    <Button variant={selected===28?'primary':'secondary'} onClick={()=>setSelected(28)} aria-pressed={selected===28}>۲۸px پیشنهادی</Button>
   <span role="status">نمونهٔ انتخابی: {selected.toLocaleString('fa-IR')} پیکسل (فقط نمایشی)</span>
  </div>
 </DemoSection>
 <DemoSection title="سایر سطوح ثابت" description="فقط ظرف اصلی در حال ارزیابی است. سایر اندازه‌ها بدون تغییر باقی می‌مانند.">
  <div className="ods-geometry-row">
   <div className="ods-geometry-card">کارت مستقل<br/><strong>۲۰px</strong></div>
   <div className="ods-geometry-nested">پنل داخلی<br/><strong>۱۶px</strong></div>
   <div className="ods-geometry-control">کنترل فرم<br/><strong>۱۲px</strong></div>
  </div>
 </DemoSection></>;}
function ShadowsPage(){return <>
 <DemoSection title="ارتفاع‌های معنایی" description="سایه فقط در سطوح مجاز؛ نه روی هر لایه یا هر هاور." flat>
  <div className="ods-shadow-grid">
   <div className="ods-shadow-example ods-shadow-example--flat"><strong>ساختار PageSurface</strong><span>بدون سایه</span></div>
   <div className="ods-shadow-example ods-shadow-example--soft"><strong>کادر مستقل تأییدشده</strong><span>0 1px 3px rgb(15 23 42 / 0.035)</span></div>
   <div className="ods-shadow-example ods-shadow-example--nested"><strong>پنل داخلی</strong><span>Flat · بدون سایهٔ تو در تو</span></div>
  </div><Note>در استودیو می‌توان شکل ۲۸ پیکسلی را بررسی کرد؛ شدت سایه همان مقدار معنایی تصویب‌شده می‌ماند.</Note>
 </DemoSection>
 </>;}
function IconsPage(){return <>
 <DemoSection title="کتابخانهٔ آیکن‌های رابط" description="نمونه‌های انتخاب‌شده از Lucide مطابق کامپوننت‌های موجود سامانه.">
  <div className="ods-icon-grid">{iconList.map(({title,icon:Icon})=><div key={title}>
    <Icon size={23} strokeWidth={1.75} aria-hidden/><span>{title}</span>
   </div>)}</div>
 </DemoSection><DemoSection title="جهت آیکن‌ها در RTL" flat>
  <div className="ods-demo-row"><Button variant="secondary"><ChevronRight size={16}/> قبلی</Button>
   <Button>بعدی <ChevronLeft size={16}/></Button>
   <IconButton label="دانلود نمونه" variant="secondary"><Download size={18}/></IconButton></div>
  <Note>جهت آیکن‌هایی که معنای حرکت دارند باید با مسیر فارسی هماهنگ باشد.</Note>
 </DemoSection></>;}
function ButtonsPage(){const [status,setStatus]=useState('برای بررسی رفتار، روی دکمه‌های فعال کلیک کنید.');return <>
 <DemoSection title="نوع دکمه‌ها" description="کامپوننت مشترک Button و طرح رنگ Ocean.">
  <div className="ods-demo-row">
   {(['primary','secondary','ghost','success','warning','danger'] as const).map(v=><Button key={v} variant={v} onClick={()=>setStatus('دکمهٔ '+v+' انتخاب شد؛ هیچ داده‌ای تغییر نکرد.')} >{v==='primary'?'اصلی':v==='secondary'?'ثانویه':v==='ghost'?'شفاف':v==='success'?'موفقیت':v==='warning'?'هشدار':'خطر'}</Button>)}
  </div><p className="ods-live" role="status">{status}</p>
 </DemoSection>
 <DemoSection title="حالت‌ها، اندازه‌ها و آیکن‌ها" flat>
  <div className="ods-demo-row">
   <Button size="sm">کوچک</Button><Button size="md">متوسط</Button><Button size="lg">بزرگ</Button>
   <Button shape="pill">کاملاً گرد</Button>
   <Button variant="secondary" disabled>غیرفعال</Button><Button loading>در حال پردازش</Button>
   <Button onClick={()=>setStatus('درخواست نمایشی ثبت شد.')}>ایجاد نمونه <Plus size={16}/></Button>
   <IconButton label="تنظیمات نمونه" variant="ghost" onClick={()=>setStatus('تنظیمات آزمایشی انتخاب شد.')}><Settings2 size={18}/></IconButton>
  </div><Note>Hover، Focus و Disabled واقعی با تعامل ماوس، Tab و صفحه‌کلید قابل بررسی‌اند.</Note>
 </DemoSection></>;}
function InputsPage(){
 const [term,setTerm]=useState('');const [role,setRole]=useState('member');const [date,setDate]=useState('');
 const [optIn,setOptIn]=useState(true);const [mode,setMode]=useState('weekly');
 return <>
 <DemoSection title="فیلدهای متن و جست‌وجو">
  <div className="ods-form-grid">
   <FormField label="عنوان فعالیت" htmlFor="ods-input-title" helpText="حداکثر ۸۰ نویسه"><Input id="ods-input-title" placeholder="یک عنوان فارسی بنویسید"/></FormField>
   <FormField label="ورودی با خطا" htmlFor="ods-input-error" error="این مقدار برای نمونه معتبر نیست."><Input id="ods-input-error" invalid defaultValue="نمونهٔ نامعتبر"/></FormField>
   <FormField label="جست‌وجو" htmlFor="ods-input-search"><SearchInput id="ods-input-search" value={term} onChange={e=>setTerm(e.target.value)} onClear={()=>setTerm('')} placeholder="جست‌وجوی نمونه"/></FormField>
   <FormField label="ورودی غیرفعال" htmlFor="ods-input-disabled"><Input id="ods-input-disabled" disabled value="غیرفعال" readOnly/></FormField>
  </div>
 </DemoSection>
 <DemoSection title="انتخاب، تاریخ و گزینه‌های فرم" flat>
  <div className="ods-form-grid">
   <FormField label="سطح دسترسی ساختگی" htmlFor="ods-role"><Select id="ods-role" searchable value={role} onChange={e=>setRole(e.target.value)} options={[
    {value:'member',label:'عضو نمونه'}, {value:'manager',label:'مدیر نمونه'}, {value:'viewer',label:'مشاهده‌گر نمونه'}
   ]}/></FormField>
   <FormField label="انتخاب تاریخ شمسی" htmlFor="ods-date"><DatePicker id="ods-date" value={date} onChange={setDate} ariaLabel="تاریخ شمسی نمونه"/></FormField>
   <div><Checkbox checked={optIn} onChange={e=>setOptIn(e.target.checked)} label="اعلان‌های نمایشی فعال باشند" description="بدون ثبت در حساب واقعی"/></div>
   <RadioGroup label="نوع گزارش" name="ods-report-mode" value={mode} onChange={setMode} options={[
    {value:'daily',label:'روزانه'}, {value:'weekly',label:'هفتگی'}
   ]}/>
  </div>
 </DemoSection>
 <DemoSection title="متن چندخطی" flat><Textarea rows={3} aria-label="توضیح نمونه" placeholder="توضیحی برای فعالیت فرضی وارد کنید."/></DemoSection>
 </>;
}
function FormsPage(){
 const [title,setTitle]=useState('');const [email,setEmail]=useState('');const [category,setCategory]=useState('project');
 const [details,setDetails]=useState('');const [submitted,setSubmitted]=useState(false);const [success,setSuccess]=useState(false);
 const titleError=submitted&&!title.trim()?'عنوان الزامی است.':'';
 const emailError=submitted&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'ایمیل نمونه معتبر نیست.':'';
 const submit=(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();setSubmitted(true);
  setSuccess(Boolean(title.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
 };
 return <><DemoSection title="فرم کامل نمونه" description="اعتبارسنجی نمایشی، پیام خطا و نتیجهٔ موفق بدون API.">
  <form noValidate onSubmit={submit} className="ods-example-form">
   <div className="ods-form-grid">
    <FormField label="عنوان درخواست" htmlFor="ods-form-title" required error={titleError}><Input id="ods-form-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="نام درخواست آزمایشی"/></FormField>
    <FormField label="ایمیل پاسخ" htmlFor="ods-form-email" required error={emailError}><Input id="ods-form-email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} placeholder="sample@example.com" type="email"/></FormField>
    <FormField label="دستهٔ درخواست" htmlFor="ods-form-category"><Select id="ods-form-category" value={category} onChange={e=>setCategory(e.target.value)}>
      <option value="project">پروژه</option><option value="task">وظیفه</option><option value="report">گزارش</option>
     </Select></FormField>
    <FormField label="توضیح تکمیلی" htmlFor="ods-form-description"><Textarea id="ods-form-description" rows={3} value={details} onChange={e=>setDetails(e.target.value)} placeholder="شرح کوتاه در مورد درخواست"/></FormField>
   </div>
   <div className="ods-demo-row"><Button type="submit">بررسی و ثبت آزمایشی</Button>
    <Button variant="secondary" onClick={()=>{setTitle('');setEmail('');setDetails('');setSubmitted(false);setSuccess(false);}}>پاک‌کردن</Button>
   </div>
   {success&&<Alert tone="success" title="فرم نمونه معتبر است" description="تغییری در پایگاه داده یا سامانهٔ واقعی ذخیره نشده است."/>}
  </form>
 </DemoSection></>;
}
const rows=[
 {id:'PR-001',name:'بازنگری قرارداد نمونه',owner:'تیم آلفا',status:'active'},
 {id:'PR-002',name:'برنامه‌ریزی فصل جاری',owner:'تیم بتا',status:'pending'},
 {id:'PR-003',name:'طراحی فرم گزارش',owner:'تیم گاما',status:'done'},
 {id:'PR-004',name:'آزمایش نمایش در موبایل',owner:'تیم آلفا',status:'active'},
 {id:'PR-005',name:'آموزش فرایندها',owner:'تیم دلتا',status:'pending'},
 {id:'PR-006',name:'مرور گزارش‌های سالانه',owner:'تیم بتا',status:'done'},
 {id:'PR-007',name:'بازبینی راهنمای فارسی',owner:'تیم آلفا',status:'active'},
];
function DataPage(){
 const [q,setQ]=useState('');const [page,setPage]=useState(1);const [descending,setDescending]=useState(false);
 const filtered=rows.filter(x=>(x.name+' '+x.owner+' '+x.id).includes(q.trim())).slice().sort((a,b)=>descending?b.id.localeCompare(a.id):a.id.localeCompare(b.id));
 const totalPages=Math.max(1,Math.ceil(filtered.length/3));const index=Math.min(page,totalPages);
 const current=filtered.slice((index-1)*3,index*3);
 return <>
 <DemoSection title="جدول قابل جست‌وجو و صفحه‌بندی" description="ردیف‌ها و رویدادها فقط نمونه هستند.">
  <div className="ods-table-toolbar"><SearchInput aria-label="جست‌وجوی ردیف‌های نمونه" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} onClear={()=>{setQ('');setPage(1);}} placeholder="عنوان، شناسه یا تیم"/>
   <Button variant="secondary" onClick={()=>{setDescending(x=>!x);setPage(1);}}>ترتیب شناسه: {descending?'نزولی':'صعودی'}</Button></div>
  {filtered.length?<><Table caption="رکوردهای نمایشی" columns={['شناسه','عنوان','مسئول','وضعیت']}>
   {current.map(row=><React.Fragment key={row.id}><TableRow><TableCell><bdi dir="ltr">{row.id}</bdi></TableCell><TableCell>{row.name}</TableCell><TableCell>{row.owner}</TableCell>
     <TableCell><Badge tone={row.status==='done'?'success':row.status==='pending'?'warning':'info'}>{row.status==='done'?'تکمیل':row.status==='pending'?'در انتظار':'فعال'}</Badge></TableCell></TableRow></React.Fragment>)}
  </Table>
  <nav className="ods-pagination" aria-label="صفحه‌بندی جدول"><Button variant="secondary" size="sm" disabled={index===1} onClick={()=>setPage(x=>x-1)}>صفحه قبل</Button>
   <span>صفحهٔ {index.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')}</span>
   <Button variant="secondary" size="sm" disabled={index===totalPages} onClick={()=>setPage(x=>x+1)}>صفحه بعد</Button></nav></>:
   <EmptyState variant="no-results" title="ردیفی با این عبارت پیدا نشد." action={<Button variant="secondary" onClick={()=>{setQ('');setPage(1);}}>پاک‌کردن جست‌وجو</Button>}/>}
 </DemoSection>
 <DemoSection title="فهرست و کارت‌های تخت" flat><div className="ods-list-grid">
  <Card title="وضعیت پروژهٔ آلفا" description="بدون سایهٔ تو در تو"><p>پیشرفت نمایشی: ۷۲٪</p><div className="ods-progress-track"><span style={{width:'72%'}}/></div></Card>
  <Card title="فهرست فعالیت‌ها"><ul className="ods-simple-list"><li>تکمیل مستندات</li><li>بررسی رابط موبایل</li><li>آزمون نمایش فارسی</li></ul></Card>
 </div></DemoSection></>;
}
function FeedbackPage(){
 const [showSuccess,setShowSuccess]=useState(true);const [modal,setModal]=useState(false);const [drawer,setDrawer]=useState(false);
 return <>
 <DemoSection title="هشدارهای معنایی" description="متن، نقش دسترس‌پذیری و کنش‌های قابل بستن.">
  <div className="ods-stack">
   <Alert tone="info" title="اطلاع‌رسانی" description="این مثال با اطلاعات ساختگی نمایش داده می‌شود."/>
   {showSuccess&&<Alert tone="success" title="عملیات موفق" description="یک اقدام فرضی کامل شد." onClose={()=>setShowSuccess(false)}/>}
   <Alert tone="warning" title="نیازمند توجه" description="این یک هشدار نمونه برای بررسی ظاهر است."/>
   <Alert tone="error" title="خطای آزمایشی" description="هیچ رخداد واقعی یا شکست سروری ثبت نشده است."/>
  </div><Button variant="secondary" onClick={()=>setShowSuccess(true)}>بازگردانی پیام بسته‌شده</Button>
 </DemoSection>
 <DemoSection title="توست، دیالوگ و کشو" flat>
  <div className="ods-demo-row">
   <Button variant="secondary" onClick={()=>toast.success('توست آزمایشی',{description:'بدون ذخیرهٔ دادهٔ واقعی.'})}>نمایش توست موفقیت</Button>
   <Button variant="secondary" onClick={()=>toast.warning('هشدار آزمایشی',{description:'این فقط نمونه است.'})}>نمایش توست هشدار</Button>
   <Button onClick={()=>setModal(true)}>بازکردن دیالوگ</Button>
   <Button variant="secondary" onClick={()=>setDrawer(true)}>بازکردن کشو</Button>
  </div>
  <Modal title="دیالوگ نمایشی Ocean" description="نمونهٔ تعامل بدون عملیات سروری" open={modal} onClose={()=>setModal(false)}>
   <p className="ods-modal-text">این دیالوگ از کامپوننت مشترک UI استفاده می‌کند. Escape و بازگشت تمرکز قابل بررسی است.</p>
   <div className="ods-demo-row"><Button onClick={()=>setModal(false)}>تأیید نمایشی</Button><Button variant="secondary" onClick={()=>setModal(false)}>انصراف</Button></div>
  </Modal>
  <Drawer title="کشوی نمایشی" open={drawer} onClose={()=>setDrawer(false)}>
   <div className="ods-stack"><p>فرم و اطلاعات این کشو آزمایشی هستند.</p><Input aria-label="عنوان داخل کشو" placeholder="عنوان کوتاه"/><Button onClick={()=>setDrawer(false)}>بستن کشو</Button></div>
  </Drawer>
 </DemoSection>
 </>;
}
function StatesPage(){
 const [status,setStatus]=useState<'loading'|'empty'|'error'>('loading');
 return <>
 <DemoSection title="وضعیت‌های بارگذاری و اسکلت" description="فاصله و شکل سطوح تا زمان آماده شدن داده حفظ می‌شود.">
  <div className="ods-state-grid"><div><span>Spinner / Loading</span><LoadingState label="در حال بارگذاری نمونه…"/></div>
   <div><span>Card Skeleton</span><CardSkeleton/></div><div><span>Table Skeleton</span><TableSkeleton rows={3} columns={3}/></div></div>
 </DemoSection>
 <DemoSection title="وضعیت خالی و خطا" flat>
  <div className="ods-demo-row">{(['loading','empty','error'] as const).map(id=><Button key={id} variant={status===id?'primary':'secondary'} aria-pressed={status===id} onClick={()=>setStatus(id)}>{id==='loading'?'بارگذاری':id==='empty'?'خالی':'خطا'}</Button>)}</div>
  {status==='loading'?<LoadingState label="بارگذاری آزمایشی"/>:status==='empty'?<EmptyState title="رکوردی در فهرست نمونه وجود ندارد." description="برای ادامه از کنش ساختگی استفاده کنید." action={<Button onClick={()=>setStatus('loading')}>بازآزمایی</Button>}/>:<ErrorState title="دریافت دادهٔ نمونه انجام نشد" onRetry={()=>setStatus('loading')}/>}
 </DemoSection></>;
}
function NavigationPage(){
 const [tab,setTab]=useState('summary');const [choice,setChoice]=useState('هیچ گزینه‌ای انتخاب نشده است.');
 return <>
 <DemoSection title="تب‌های قابل کنترل" description="جابجایی با صفحه‌کلید، Home/End و جهت درست در RTL.">
  <Tabs ariaLabel="تب‌های آزمایشی" value={tab} onChange={setTab} items={[
   {id:'summary',label:'نمای کلی'}, {id:'activities',label:'فعالیت‌ها',badge:<Badge usage="count">۷</Badge>},{id:'security',label:'امنیت',disabled:true}
  ]}/>
  <div className="ods-tab-content" role="tabpanel">پنل فعال: {tab==='summary'?'نمای کلی':'فعالیت‌ها'}</div>
 </DemoSection>
 <DemoSection title="Breadcrumb، Tooltip، Popover و منوی بازشو" flat>
  <nav className="ods-demo-breadcrumb" aria-label="مسیر نمونه"><Link to={studioPath('')}>استودیو</Link><ChevronLeft size={14}/><span>اجزای تعاملی</span><ChevronLeft size={14}/><strong>ناوبری</strong></nav>
  <div className="ods-demo-row">
   <Tooltip label="راهنمای کوتاه برای یک کنش"><Button variant="secondary">نگه‌داشتن نشانگر یا فوکوس</Button></Tooltip>
   <Popover label="بازکردن توضیح" ariaLabel="توضیح آزمایشی"><div className="ods-popover-content">این پنل یک نمونهٔ کوتاه و غیرعملیاتی است.</div></Popover>
   <DropdownMenu label="عملیات نمونه" ariaLabel="فهرست عملیات آزمایشی" items={[
    {id:'view',label:'مشاهده',onSelect:()=>setChoice('مشاهدهٔ نمونه')},
    {id:'copy',label:'رونوشت',onSelect:()=>setChoice('رونوشت نمایشی')},
    {id:'locked',label:'عملیات غیرفعال',disabled:true,onSelect:()=>{}}
   ]}/>
  </div><p className="ods-live" role="status">{choice}</p>
 </DemoSection></>;
}
function DashboardPage(){return <>
 <div className="ods-dashboard-grid">
  <Card title="پروژه‌های فعال" description="کارت مستقل ۲۰ پیکسل" elevation="standalone"><strong className="ods-dashboard-number">۱۲</strong><Badge tone="success">+۳ نسبت به دورهٔ نمونه</Badge></Card>
  <Card title="وظایف امروز" description="نمونهٔ کارتابل" elevation="standalone"><strong className="ods-dashboard-number">۲۸</strong><Badge tone="info">در جریان</Badge></Card>
  <Card title="زمان انجام" description="ساعتِ نمونه" elevation="standalone"><strong className="ods-dashboard-number">۴۲</strong><Badge tone="warning">نیازمند بررسی</Badge></Card>
 </div>
 <DemoSection title="نمودار و پیشرفت" flat><div className="ods-chart-sample" role="img" aria-label="نمودار نمایشی فعالیت هفت روز">
  {[39,55,44,72,61,84,68].map((value,index)=><div key={index}><span style={{height:value+'%'}}/><small>{(index+1).toLocaleString('fa-IR')}</small></div>)}</div>
  <Note>نمودار نمایشی جایگزین دادهٔ عملیاتی نمی‌شود؛ تعامل و رنگ‌گذاری باید به دادهٔ معتبر متصل شوند.</Note>
 </DemoSection></>;}
function LocalePage(){
 const [date,setDate]=useState('2026-11-08');const example=new Date('2026-11-08T09:00:00Z');
 return <>
 <DemoSection title="نمایش اعداد و تاریخ به فارسی" description="متن و تقویم شمسی با جهت RTL، شناسه‌های لاتین در محدودهٔ مجزا.">
  <div className="ods-locale-grid">
   <div><small>عدد</small><strong>{new Intl.NumberFormat('fa-IR').format(12500000)}</strong></div>
   <div><small>تاریخ هجری شمسی</small><strong>{new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(example)}</strong></div>
   <div><small>درصد</small><strong>{new Intl.NumberFormat('fa-IR',{style:'percent',maximumFractionDigits:0}).format(.72)}</strong></div>
  </div><div className="ods-form-grid"><FormField label="انتخاب تاریخ" htmlFor="ods-locale-date"><DatePicker id="ods-locale-date" value={date} onChange={setDate} ariaLabel="تاریخ شمسی"/></FormField></div>
 </DemoSection>
 <DemoSection title="نمایش متن ترکیبی RTL/LTR" flat>
  <p className="ods-mixed-text">سفارش آزمایشی <bdi dir="ltr">TDB-2026/0012</bdi> برای حساب <bdi dir="ltr">design@example.com</bdi> ثبت نشده و صرفاً نمایشی است.</p>
  <Input dir="ltr" aria-label="شناسه لاتین نمونه" defaultValue="TDBR-00042" className="ods-ltr-input"/>
  <Note>برای قطعات انگلیسی و شناسه‌ها از bdi و dir مناسب استفاده می‌شود.</Note>
 </DemoSection></>;}
type CoverageStatus='present'|'partial'|'valuable'|'later';
type CoverageRow={area:string;status:CoverageStatus;priority:string;detail:string;reference:string};
export const STUDIO_COVERAGE:CoverageRow[]=[
 {area:'Buttons / Badges / Tokens',status:'present',priority:'نگهداری',detail:'Button، Badge و توکن‌های معنایی Ocean وجود دارند.',reference:'Tabler · MUI'},
 {area:'Input / Select / Date Picker',status:'present',priority:'نگهداری',detail:'ورودی‌های فارسی و تاریخ شمسی در کتابخانهٔ فعلی موجودند.',reference:'Ant Design · MUI'},
 {area:'Tables / Pagination',status:'present',priority:'نگهداری',detail:'Table و DataTable همراه فیلتر/صفحه‌بندی در پروژه وجود دارند.',reference:'shadcn/ui · Tabler'},
 {area:'Alerts / Toast / Dialog / Drawer',status:'present',priority:'نگهداری',detail:'کامپوننت‌های مشترک موجود؛ رعایت ارتفاع Overlay.',reference:'Ant Design · Tabler'},
 {area:'RTL / Persian localization',status:'partial',priority:'بالا',detail:'RTL و فونت فارسی موجود؛ نیازمند آزمون متن ترکیبی و فرمت‌های بین‌المللی.',reference:'Ant Design'},
 {area:'Keyboard / a11y review',status:'partial',priority:'بالا',detail:'الگوهای فوکوس وجود دارند؛ پوشش E2E روی دستگاه‌ها ناقص است.',reference:'MUI · shadcn/ui'},
 {area:'Command palette / quick jump',status:'valuable',priority:'متوسط',detail:'برای ناوبری سریع سازمان‌های بزرگ پس از بررسی مجوزها سودمند است.',reference:'Tabler · shadcn/ui'},
 {area:'Advanced filters / query builder',status:'valuable',priority:'بالا',detail:'فیلترهای قابل ترکیب و ذخیرهٔ نمایشی برای جدول‌های بزرگ ارزشمندند.',reference:'Ant Design · MUI X'},
 {area:'Wizard / stepper for long forms',status:'valuable',priority:'متوسط',detail:'برای فرایندهای چندمرحله‌ای اداری با اعتبارسنجی مرحله‌ای مناسب است.',reference:'MUI · Ant Design'},
 {area:'Tree view / hierarchy navigator',status:'valuable',priority:'متوسط',detail:'برای پوشه، سازمان و ساختار واحدها با قابلیت کیبورد.',reference:'Ant Design · MUI X'},
 {area:'Product tour (production)',status:'partial',priority:'آینده',detail:'پروتوتایپ موجود؛ قرارداد مجوز و پیشرفت پایدار در محصول فعال نشده.',reference:'Ant Design Tour · Tabler'},
 {area:'Editable widget layout (production)',status:'partial',priority:'آینده',detail:'پروتوتایپ موجود؛ ذخیره‌سازی واقعی نیازمند قرارداد جداست.',reference:'Tabler widgets'},
 {area:'Transfer lists / Ratings',status:'later',priority:'خارج MVP',detail:'کاربرد مستقیم فعلی محدود؛ اضافه‌شدن بدون نیاز واقعی توصیه نمی‌شود.',reference:'MUI · Ant Design'},
 {area:'Decorative carousel / complex motion',status:'later',priority:'خارج MVP',detail:'پیچیدگی بصری و هزینهٔ نگهداری بدون ارزش روشن.',reference:'Tabler · MUI'}
];
const coverageNames:Record<CoverageStatus,string>={present:'موجود',partial:'موجود اما ناقص',valuable:'غایب و ارزشمند',later:'خارج از MVP'};
function CoveragePage(){return <>
 <DemoSection title="ماتریس پوشش Ocean" description="اولویت براساس نیاز نرم‌افزار سازمانی فارسی؛ نه کپی‌کردن تمام امکانات سایر کتابخانه‌ها.">
  <div className="ods-coverage-table"><table><caption className="sr-only">پوشش اجزای Ocean</caption>
   <thead><tr><th>حوزه</th><th>وضعیت</th><th>اولویت</th><th>ملاحظات تدبیر</th><th>الگوی مرجع</th></tr></thead>
   <tbody>{STUDIO_COVERAGE.map(row=><tr key={row.area}><th scope="row">{row.area}</th><td><span data-status={row.status} className="ods-coverage-badge">{coverageNames[row.status]}</span></td>
    <td>{row.priority}</td><td>{row.detail}</td><td>{row.reference}</td></tr>)}</tbody></table></div>
 </DemoSection>
 <DemoSection title="مستندات رسمی بررسی‌شده" flat><div className="ods-reference-links">
  <a href="https://docs.tabler.io/ui/components" target="_blank" rel="noopener noreferrer">Tabler components <ArrowLeft size={15}/></a>
  <a href="https://ui.shadcn.com/docs/components/radix/sidebar" target="_blank" rel="noopener noreferrer">shadcn/ui sidebar <ArrowLeft size={15}/></a>
  <a href="https://ant.design/components/overview/" target="_blank" rel="noopener noreferrer">Ant Design components <ArrowLeft size={15}/></a>
  <a href="https://mui.com/material-ui/all-components/" target="_blank" rel="noopener noreferrer">Material UI components <ArrowLeft size={15}/></a>
 </div><Note>هیچ کتابخانه یا وابستگی خارجی جدیدی به فرانت‌اند افزوده نشده است.</Note></DemoSection>
 </>;}
export function StudioOverview(){
 return <div className="ods-overview">
   <section className="ods-welcome"><span className="ods-eyebrow">OCEAN DESIGN SYSTEM / 02</span>
    <h2>یک سیستم طراحی، تمام اجزای تدبیر</h2>
    <p>مسیرهای مستقل برای بررسی حالت‌های کامپوننت‌ها، سیستم بصری و نمونه‌های تعاملی؛ بدون اتصال به اطلاعات کاربر.</p>
    <div className="ods-hero-actions"><Link to={studioPath('components/buttons')}>بررسی دکمه‌ها <ArrowLeft size={16}/></Link>
     <Link to={studioPath('foundations/radius')}>مقایسهٔ گردی سطوح</Link></div>
   </section>
   <div className="ods-overview-grid">{STUDIO_GROUPS.filter(x=>x.id!=='home').map(group=>{
    const Icon=group.items[0].icon;
    return <Link key={group.id} className="ods-overview-group" to={studioPath(group.items[0].slug)}>
     <span className="ods-group-icon"><Icon size={20}/></span><strong>{group.title}</strong>
     <small>{group.items.length.toLocaleString('fa-IR')} صفحهٔ مستقل</small><ArrowLeft size={16}/></Link>;
   })}</div>
 </div>;
}
export function StudioDemoPage({pageId}:{pageId:string}){
 switch(pageId){
  case 'colors':return <ColorsPage/>;
  case 'typography':return <TypographyPage/>;
  case 'spacing':return <SpacingPage/>;
  case 'radius':return <RadiusPage/>;
  case 'shadows':return <ShadowsPage/>;
  case 'icons':return <IconsPage/>;
  case 'buttons':return <ButtonsPage/>;
  case 'inputs':return <InputsPage/>;
  case 'forms':return <FormsPage/>;
  case 'data':return <DataPage/>;
  case 'feedback':return <FeedbackPage/>;
  case 'states':return <StatesPage/>;
  case 'navigation':return <NavigationPage/>;
  case 'dashboard':return <DashboardPage/>;
  case 'locale':return <LocalePage/>;
  case 'coverage':return <CoveragePage/>;
  default:return <EmptyState variant="no-results" title="نمونه‌ای برای این صفحه موجود نیست." description="از فهرست سمت راست یک صفحهٔ دیگر انتخاب کنید."/>;
 }
}
