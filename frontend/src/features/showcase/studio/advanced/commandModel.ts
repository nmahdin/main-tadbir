import {STUDIO_PAGES,studioPath} from '../studioRoutes';
import {normalizePersian} from './filterModel';
export type MockEnvironment='workspace'|'organization'|'platform';
export type CommandEntry={id:string;pageId:string;label:string;hint:string;allowed:readonly MockEnvironment[]};
export const MOCK_COMMANDS:CommandEntry[]=[
 {id:'home',pageId:'overview',label:'نمای کلی استودیو',hint:'بازگشت به صفحهٔ آغاز',allowed:['workspace','organization','platform']},
 {id:'buttons',pageId:'buttons',label:'نمونهٔ دکمه‌ها',hint:'حالت‌ها و نمونه‌ها',allowed:['workspace','organization','platform']},
 {id:'forms',pageId:'forms',label:'فرم‌های کامل',hint:'نمونه‌های ورودی',allowed:['workspace','organization','platform']},
 {id:'filters',pageId:'advanced-filters',label:'فیلترهای پیشرفته',hint:'الگوی ترکیب شرط‌ها',allowed:['organization','platform']},
 {id:'wizard',pageId:'advanced-wizard',label:'فرم چندمرحله‌ای',hint:'اعتبارسنجی در هر مرحله',allowed:['workspace','organization','platform']},
 {id:'dashboard',pageId:'dashboard',label:'ابزارک‌های داشبورد',hint:'نمونه‌های آماری',allowed:['workspace','organization','platform']},
 {id:'tour',pageId:'tour',label:'تور نمایشی محصول',hint:'راهنمای مرحله‌ای',allowed:['workspace','organization','platform']},
 {id:'layout',pageId:'layout',label:'ویرایش چیدمان نمونه',hint:'تغییرات حافظهٔ موقت',allowed:['organization','platform']},
 {id:'coverage',pageId:'coverage',label:'ماتریس پوشش Ocean',hint:'پژوهش UI',allowed:['platform']}
];
export function getCommands(environment:MockEnvironment,search:string):CommandEntry[]{
 const needle=normalizePersian(search);
 return MOCK_COMMANDS.filter(x=>x.allowed.includes(environment)&&Boolean(STUDIO_PAGES.find(p=>p.id===x.pageId))&&
  (!needle||normalizePersian(x.label+' '+x.hint).includes(needle)));
}
export function commandDestination(command:CommandEntry,environment:MockEnvironment):string|null{
 if(!getCommands(environment,'').some(x=>x.id===command.id))return null;
 const page=STUDIO_PAGES.find(x=>x.id===command.pageId);
 return page?studioPath(page.slug):null;
}
export function moveCommandIndex(index:number,direction:'up'|'down',count:number):number{
 if(count<=0)return -1;
 return (index+(direction==='down'?1:-1)+count)%count;
}
/** Permission rules here are mock-only. Production would require real entitlement
  checks on destination execution as well as filtering and audit-safe routing. */
