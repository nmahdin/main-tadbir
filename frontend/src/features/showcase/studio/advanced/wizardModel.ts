export type WizardData={title:string;category:string;contact:string;description:string};
export type WizardStep=0|1|2|3;
export type LayoutDirection='horizontal'|'vertical';
export const WIZARD_DEFAULT:WizardData={title:'',category:'general',contact:'',description:''};
export const WIZARD_STEPS=['مشخصات درخواست','اطلاعات ارتباطی','مرور و بررسی','تأیید نمونه'] as const;
export function wizardErrors(data:WizardData,step:WizardStep):Record<string,string>{
 const errors:Record<string,string>={};
 if(step===0){if(data.title.trim().length<3)errors.title='عنوان درخواست باید حداقل ۳ نویسه باشد.';
  if(!['general','technical','administrative'].includes(data.category))errors.category='دسته معتبر نیست.';}
 if(step===1){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact.trim()))errors.contact='ایمیل معتبر وارد کنید.';
  if(data.description.trim().length<10)errors.description='توضیح درخواست باید حداقل ۱۰ نویسه باشد.';}
 return errors;
}
export function canAdvance(data:WizardData,step:WizardStep):boolean{return !Object.keys(wizardErrors(data,step)).length;}
export function wizardProgress(step:WizardStep):number{return Math.round((step/3)*100);}
export function isWizardDirty(data:WizardData):boolean{return Object.keys(WIZARD_DEFAULT).some(key=>data[key as keyof WizardData]!==WIZARD_DEFAULT[key as keyof WizardData]);}
export function safeStep(index:number):WizardStep{return Math.max(0,Math.min(3,Math.floor(index))) as WizardStep;}
/** A production contract would require server-side validation and a draft schema,
  explicit save permissions and transactional submission; this demo has none. */
