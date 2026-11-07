export type LabEnvironment = 'workspace' | 'organization' | 'platform';
export type LabDevice = 1440 | 834 | 390;
export const LAB_ENVS: {value:LabEnvironment; label:string; role:string}[] = [
 {value:'workspace',label:'فضای کاری شخصی',role:'عضو نمایشی'},
 {value:'organization',label:'مدیریت سازمان',role:'مدیر نمایشی سازمان'},
 {value:'platform',label:'مدیریت پلتفرم',role:'مدیر نمایشی پلتفرم'},
];
export const LAB_WIDTHS:LabDevice[] = [1440,834,390];
export const defaultCollapsed = (device:LabDevice) => device === 834;
export const mobileDrawer = (device:LabDevice) => device === 390;
export function toggleGroup(open:string[],key:string){return open.includes(key)?open.filter(x=>x!==key):[...open,key];}
export function ensureActive(keys:string[],active?:string){return active && keys.includes(active)?active:(keys[0]??'');}
