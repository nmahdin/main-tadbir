export type Field='title'|'owner'|'status'|'priority';
export type Operator='contains'|'equals'|'notEquals'|'startsWith';
export type Join='and'|'or';
export type Condition={id:string;field:Field;op:Operator;value:string};
export type Group={id:string;join:Join;conditions:Condition[]};
export type Filter={v:1;join:Join;groups:Group[]};
export type RecordRow={id:string;title:string;owner:string;status:string;priority:string};
export const FIELDS:{id:Field;label:string;operators:readonly Operator[];options?:readonly string[]}[]=[
 {id:'title',label:'عنوان',operators:['contains','equals','notEquals','startsWith']},
 {id:'owner',label:'مسئول',operators:['contains','equals','notEquals','startsWith']},
 {id:'status',label:'وضعیت',operators:['equals','notEquals'],options:['در جریان','تکمیل','در انتظار']},
 {id:'priority',label:'اولویت',operators:['equals','notEquals'],options:['بالا','متوسط','پایین']}];
export const OPERATORS:Record<Operator,string>={contains:'شامل',equals:'برابر',notEquals:'نابرابر',startsWith:'شروع با'};
export const ROWS:RecordRow[]=[
 {id:'TD-001',title:'گزارش مالی سالانه',owner:'سارا رضایی',status:'در جریان',priority:'بالا'},
 {id:'TD-002',title:'فرم درخواست مرخصی',owner:'علی موسوی',status:'در انتظار',priority:'متوسط'},
 {id:'TD-003',title:'بازبینی قرارداد',owner:'مریم کریمی',status:'تکمیل',priority:'بالا'},
 {id:'TD-004',title:'گزارش خرید',owner:'سارا رضایی',status:'در جریان',priority:'پایین'},
 {id:'TD-005',title:'جلسه آموزشی',owner:'مریم کریمی',status:'در انتظار',priority:'متوسط'},
 {id:'TD-006',title:'گزارش پیشرفت',owner:'علی موسوی',status:'تکمیل',priority:'بالا'}
];
export const EMPTY_FILTER:Filter={v:1,join:'and',groups:[]};
export const makeGroup=(id:string):Group=>({id,join:'and',conditions:[{id:id+'-c0',field:'title',op:'contains',value:''}]});
export function normalizePersian(text:string):string{return text.normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک')
 .replace(/[\u064B-\u065F\u0670]/g,'').replace(/[\u200c\u200d]/g,' ').replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-0x6f0))
 .replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-0x660)).toLocaleLowerCase('fa-IR').replace(/\s+/g,' ').trim();}
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const safeId=(v:unknown)=>typeof v==='string'&&/^[a-z0-9-]{1,40}$/.test(v);
const validJoin=(v:unknown):v is Join=>v==='and'||v==='or';
export function validFilter(v:unknown):v is Filter{
 if(!object(v)||v.v!==1||!validJoin(v.join)||!Array.isArray(v.groups)||v.groups.length>4)return false;
 const ids=new Set<string>();
 for(const g of v.groups){
  if(!object(g)||!safeId(g.id)||ids.has(g.id)||!validJoin(g.join)||!Array.isArray(g.conditions)||!g.conditions.length||g.conditions.length>5)return false;
  ids.add(g.id as string);
  for(const c of g.conditions){
   if(!object(c)||!safeId(c.id)||ids.has(c.id)||typeof c.value!=='string'||c.value.length>100||/[\u0000-\u001f]/.test(c.value))return false;
   const field=FIELDS.find(f=>f.id===c.field);if(!field||!field.operators.some(op=>op===c.op))return false;
   ids.add(c.id as string);
  }
 }
 return true;
}
export function parseFilter(raw:string|null):Filter{if(!raw||raw.length>3000)return EMPTY_FILTER;try{const v:unknown=JSON.parse(raw);return validFilter(v)?v:EMPTY_FILTER;}catch{return EMPTY_FILTER;}}
export function matchRows(rows:readonly RecordRow[],filter:Filter):RecordRow[]{
 const join=(xs:boolean[],op:Join)=>op==='and'?xs.every(Boolean):xs.some(Boolean);
 if(!filter.groups.length)return [...rows];
 return rows.filter(row=>join(filter.groups.map(g=>join(g.conditions.map(c=>{
  const value=normalizePersian(c.value),cell=normalizePersian(row[c.field]);if(!value)return true;
  if(c.op==='contains')return cell.includes(value);if(c.op==='startsWith')return cell.startsWith(value);
  if(c.op==='equals')return cell===value;return cell!==value;
 }),g.join)),filter.join));
}
/** Future server validation: validate v, all fields/operators, max 4 groups ×5 conditions,
  max value length 100, tenant/role scoped fields and parameterized predicates. No raw SQL. */
