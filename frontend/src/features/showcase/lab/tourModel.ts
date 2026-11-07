import type {LabEnvironment} from './shellState';
export type TourStep={id:string;targetId:string;title:string;description:string};
export type TourManifest={id:string;version:string;environment:LabEnvironment;steps:TourStep[]};
const targets=[
 {id:'nav',targetId:'demo-navigation',title:'دسترسی سریع',description:'این فقط نمونه‌ای از منوهای قابل استفاده در محیط انتخابی است.'},
 {id:'dashboard',targetId:'demo-dashboard',title:'نمای کلی',description:'کارت‌ها و داده‌های ساختگی برای بررسی ساختار داشبورد نمایش داده شده‌اند.'},
 {id:'notifications',targetId:'demo-notifications',title:'اعلان‌های نمونه',description:'اعلان‌ها در این نسخه واقعی نیستند و هیچ پیامی ارسال نمی‌شود.'},
 {id:'profile',targetId:'demo-profile',title:'پروفایل نمایشی',description:'این بخش به حساب کاربری یا نشست واقعی متصل نیست.'},
];
export const TOUR_MANIFESTS:Record<LabEnvironment,TourManifest>={
 workspace:{id:'tadbir-personal-intro',version:'1.0.0',environment:'workspace',steps:targets},
 organization:{id:'tadbir-organization-intro',version:'1.0.0',environment:'organization',steps:[{...targets[0],description:'منوی نمایشی سازمان؛ هیچ دسترسی واقعی بررسی یا تغییر نمی‌شود.'},...targets.slice(1)]},
 platform:{id:'tadbir-platform-intro',version:'1.0.0',environment:'platform',steps:[{...targets[0],description:'منوی نمایشی پلتفرم؛ این یک کنسول مدیریتی واقعی نیست.'},...targets.slice(1)]}
};
export function validateTourManifest(input:TourManifest):boolean{
 return Boolean(input.id&&/^\d+\.\d+\.\d+$/.test(input.version)&&
 ['workspace','organization','platform'].includes(input.environment)&&
 input.steps.length>=3&&input.steps.length<=6&&new Set(input.steps.map(x=>x.id)).size===input.steps.length&&
 input.steps.every(x=>/^[a-z][a-z0-9-]*$/.test(x.id)&&/^demo-[a-z-]+$/.test(x.targetId)&&x.title.trim()&&x.description.trim()));
}
export type TourPhase='idle'|'welcome'|'active'|'finished'|'skipped';
export type TourState={phase:TourPhase;index:number;version:string};
export type TourAction={type:'WELCOME'|'START'|'NEXT'|'BACK'|'SKIP'|'REPLAY'|'CLOSE'|'RESET';total?:number;version?:string};
export function tourReducer(state:TourState,action:TourAction):TourState{
 switch(action.type){
  case 'RESET':return {phase:'idle',index:0,version:action.version??state.version};
  case 'WELCOME':case 'REPLAY':return {phase:'welcome',index:0,version:state.version};
  case 'START':return state.phase==='welcome'?{...state,phase:'active',index:0}:state;
  case 'NEXT':return state.phase!=='active'?state:state.index+1>=(action.total??0)?{...state,phase:'finished'}:{...state,index:state.index+1};
  case 'BACK':return state.phase==='active'?{...state,index:Math.max(0,state.index-1)}:state;
  case 'SKIP':return state.phase==='idle'?state:{...state,phase:'skipped'};
  case 'CLOSE':return {...state,phase:'idle',index:0};
 }
}
export function missingTarget(targetIds:readonly string[],targetId:string):boolean{return !targetIds.includes(targetId);}
