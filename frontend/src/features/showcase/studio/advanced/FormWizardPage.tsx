import React,{useEffect,useRef,useState} from 'react';
import {Button,Card,Input,Textarea,FormField} from '../../../../shared/ui/Primitives';
import {WIZARD_DEFAULT,WIZARD_STEPS,canAdvance,isWizardDirty,safeStep,wizardErrors,wizardProgress,type WizardData,type WizardStep,type LayoutDirection} from './wizardModel';
export function FormWizardPage(){
 const [data,setData]=useState<WizardData>({...WIZARD_DEFAULT});
 const [step,setStep]=useState<WizardStep>(0),[direction,setDirection]=useState<LayoutDirection>('horizontal');
 const [errors,setErrors]=useState<Record<string,string>>({}),[confirmDiscard,setConfirmDiscard]=useState(false),[message,setMessage]=useState('');
 const dirty=isWizardDirty(data)&&step!==3;
 const heading=useRef<HTMLHeadingElement>(null),discardTrigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(dirty){const fn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn);}},[dirty]);
 useEffect(()=>{heading.current?.focus();},[step]);
 useEffect(()=>{
  if(confirmDiscard){const fn=(e:KeyboardEvent)=>{if(e.key==='Escape'){setConfirmDiscard(false);discardTrigger.current?.focus();}};document.addEventListener('keydown',fn);return()=>document.removeEventListener('keydown',fn);}
 },[confirmDiscard]);
 function next(){const found=wizardErrors(data,step);setErrors(found);if(Object.keys(found).length){setMessage('لطفاً خطاهای این مرحله را اصلاح کنید.');return;}
  if(step===2){setStep(3);setMessage('فرم نمونه تأیید شد؛ هیچ داده‌ای ارسال یا ذخیره نشد.');}
  else{setStep(safeStep(step+1));setMessage('');}}
 function back(){if(step===0)return;setStep(safeStep(step-1));setErrors({});setMessage('');}
 function clear(){setData({...WIZARD_DEFAULT});setStep(0);setErrors({});setMessage('پیش‌نویس نمونه پاک شد.');setConfirmDiscard(false);discardTrigger.current?.focus();}
 return <section className="ods-wizard" aria-label="نمونهٔ فرم چندمرحله‌ای" dir="rtl">
  <Card title="فرایند ثبت درخواست آزمایشی" description="اعتبارسنجی در مرورگر؛ بدون ثبت اطلاعات واقعی.">
   <div className="ods-wizard-toolbar"><label>چیدمان راهنما<select aria-label="جهت نمایش راهنمای مراحل" value={direction} onChange={e=>setDirection(e.target.value as LayoutDirection)}>
    <option value="horizontal">افقی (RTL)</option><option value="vertical">عمودی</option></select></label>
    <span>{wizardProgress(step).toLocaleString('fa-IR')}٪ پیشرفت</span>
   </div>
   <div className="ods-wizard-progress" role="progressbar" aria-label="پیشرفت مراحل" aria-valuemin={0} aria-valuemax={100} aria-valuenow={wizardProgress(step)}>
    <span style={{width:wizardProgress(step)+'%'}}/></div>
   <div className={'ods-wizard-shell ods-wizard-shell--'+direction}>
    <ol className="ods-wizard-steps" aria-label="مراحل ثبت درخواست">
     {WIZARD_STEPS.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} data-status={i<step?'done':i===step?'current':'upcoming'}>
      <span>{(i+1).toLocaleString('fa-IR')}</span><strong>{label}</strong>
     </li>)}
    </ol>
    <div className="ods-wizard-content">
     <h2 tabIndex={-1} ref={heading}>{WIZARD_STEPS[step]}</h2>
     {Object.keys(errors).length>0&&<div role="alert" className="ods-wizard-errors"><strong>خطاهای این مرحله:</strong><ul>{Object.entries(errors).map(([key,val])=><li key={key}>{val}</li>)}</ul></div>}
     {step===0&&<div className="ods-wizard-fields">
      <FormField label="عنوان درخواست" required htmlFor="ods-wizard-title" error={errors.title}><Input id="ods-wizard-title" value={data.title} aria-invalid={Boolean(errors.title)} onChange={e=>setData({...data,title:e.target.value})} placeholder="مثلاً درخواست دسترسی آموزشی"/></FormField>
      <FormField label="دسته‌بندی" htmlFor="ods-wizard-category" error={errors.category}><select id="ods-wizard-category" value={data.category} onChange={e=>setData({...data,category:e.target.value})}>
       <option value="general">عمومی</option><option value="technical">فنی</option><option value="administrative">اداری</option>
      </select></FormField>
     </div>}
     {step===1&&<div className="ods-wizard-fields">
      <FormField label="ایمیل پاسخ" required htmlFor="ods-wizard-contact" error={errors.contact}><Input id="ods-wizard-contact" dir="ltr" type="email" value={data.contact} aria-invalid={Boolean(errors.contact)} placeholder="sample@example.com" onChange={e=>setData({...data,contact:e.target.value})}/></FormField>
      <FormField label="توضیح درخواست" required htmlFor="ods-wizard-description" error={errors.description}><Textarea id="ods-wizard-description" value={data.description} rows={4} aria-invalid={Boolean(errors.description)} placeholder="توضیح کوتاه و نمونه" onChange={e=>setData({...data,description:e.target.value})}/></FormField>
     </div>}
     {step===2&&<div className="ods-wizard-review"><p>پیش از تأیید نهایی، نمونه را مرور کنید:</p>
      <dl><dt>عنوان</dt><dd>{data.title}</dd><dt>دسته‌بندی</dt><dd>{data.category==='technical'?'فنی':data.category==='administrative'?'اداری':'عمومی'}</dd><dt>ایمیل</dt><dd><bdi dir="ltr">{data.contact}</bdi></dd><dt>توضیح</dt><dd>{data.description}</dd></dl>
      <p>با فشردن «تأیید نمایشی» چیزی به سرور فرستاده نخواهد شد.</p>
     </div>}
     {step===3&&<div role="status" className="ods-wizard-done"><strong>فرایند نمونه به پایان رسید.</strong><p>هیچ اطلاعاتی ثبت، ارسال یا ذخیره نشده است.</p></div>}
     <p className="ods-pattern-hint" role="status">{message}</p>
     <div className="ods-wizard-actions">
      {step!==3&&<><Button variant="secondary" disabled={step===0} onClick={back}>قبلی</Button><Button onClick={next}>{step===2?'تأیید نمایشی':'مرحلهٔ بعد'}</Button></>}
      {step!==3&&<button ref={discardTrigger} type="button" onClick={()=>{if(dirty)setConfirmDiscard(true);else clear();}}>لغو و پاک‌کردن</button>}
      {step===3&&<Button onClick={clear}>شروع دوباره</Button>}
     </div>
    </div>
   </div>
  </Card>
  {confirmDiscard&&<div className="ods-wizard-overlay"><div role="alertdialog" aria-modal="true" aria-labelledby="ods-discard-title" aria-describedby="ods-discard-description" className="ods-wizard-dialog">
   <h3 id="ods-discard-title">تغییرات ذخیره‌نشده</h3><p id="ods-discard-description">اگر لغو کنید، اطلاعات این فرم آزمایشی پاک می‌شوند.</p>
   <div className="ods-wizard-actions"><Button variant="secondary" onClick={()=>{setConfirmDiscard(false);discardTrigger.current?.focus();}}>ادامهٔ ویرایش</Button><Button onClick={clear}>حذف پیش‌نویس</Button></div>
  </div></div>}
  <p className="ods-pattern-hint">این نمونه صرفاً نشان‌دهندهٔ قرارداد مراحل و اعتبارسنجی است؛ در محصول واقعی، خروج از مسیر، ذخیرهٔ پیش‌نویس و ارسال نهایی به مجوز و تأیید جداگانه نیاز دارند.</p>
 </section>;
}
