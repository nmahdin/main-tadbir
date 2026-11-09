import {request,type ApiResponse} from '../../shared/api/client';

/** C5-M2-S4 verified contracts. Money is always server authoritative. */
export type Period='monthly'|'quarterly'|'annual';
export {PERIODS,PERIOD_LABELS,convertible,cancellable,owns} from './commercialRules';
export type OwnerScope={kind:'personal'}|{kind:'organization';organizationId:number};
export type Plan={id:number;key:string;name:string;audience:'personal'|'organization';status?:string};
export type Price={id:number;period:Period;amount_toman:number;is_published?:boolean;is_superseded?:boolean;published_at?:string|null};
export type Entry={plan:Plan;version:{id:number;version:number};prices:Record<Period,Price|null>};
export type AmountSnapshot={subtotal_toman:number;discount_toman:number;tax_toman:number;total_toman:number};
export type OwnedSnapshot={id:number;owner_key:string;organization_id:number|null;personal_workspace_id:number|null};
export type Quote=OwnedSnapshot&AmountSnapshot&{
 plan:Plan|null;plan_version_id:number;price_id:number;period:Period;status:'open'|'expired'|'superseded'|'converted';
 remaining_seconds:number;expires_at:string|null;created_at:string|null;converted_at:string|null;
 promotion:{id:number;code:string}|null;tax:{id:number;rate_basis_points:number}|null;
 superseded_by_quote_id:number|null;payment_initiated:false;
};
export type OrderLine={id:number;kind:string;description:string;amount_toman:number;tax_rate_basis_points:number|null};
export type Order=OwnedSnapshot&AmountSnapshot&{
 quote_id:number;period:Period;status:'in_review'|'cancelled'|'review_expired'|'payable_pending'|'paid';
 review_expires_at:string|null;review_remaining_seconds:number;cancelled_at:string|null;expired_at:string|null;created_at:string|null;
 lines:OrderLine[];payment_initiated:boolean;promotion:{id:number;code:string}|null;tax:{id:number;rate_basis_points:number}|null;
};
export type VersionPrice={id:number;version:number;published_at:string|null;grace_days:number;prices:Record<Period,Price|null>;draft_prices:Price[]};
export type PlanPrices={plan:Plan;versions:VersionPrice[]};
export type TaxRule={id:number;label:string;rate_basis_points:number;is_active:boolean;valid_from:string|null;valid_until:string|null};
export type Promotion={id:number;code:string;label:string;discount_type:'fixed'|'percent';discount_value_bp:number|null;discount_value_toman:number|null;is_active:boolean};
export const toman=(n:number|null|undefined)=>n===null||n===undefined?'—':n.toLocaleString('fa-IR')+' تومان';
const ownerPath=(s:OwnerScope,kind:'quotes'|'orders')=>s.kind==='personal'?'/billing/'+kind:'/billing/'+kind+'/organizations/'+s.organizationId;
const post=(key:string,body:unknown)=>({method:'POST',headers:{'Idempotency-Key':key},body});
export const commercialApi={
 catalog:()=>request<ApiResponse<{plans:Entry[]}>>('/billing/catalog'),
 quotes:(scope:OwnerScope)=>request<ApiResponse<{quotes:Quote[]}>>(ownerPath(scope,'quotes')),
 quote:(id:number)=>request<ApiResponse<{quote:Quote}>>('/billing/quotes/'+id),
 createQuote:(scope:OwnerScope,versionId:number,period:Period,promo:string|undefined,key:string)=>request<ApiResponse<{quote:Quote;is_replay:boolean}>>(
  scope.kind==='personal'?'/billing/quotes/personal':'/billing/quotes/organizations/'+scope.organizationId,
  post(key,{plan_version_id:versionId,period,promo_code:promo||undefined,idempotency_key:key})),
 convertQuote:(id:number,key:string)=>request<ApiResponse<{order:Order;is_replay:boolean}>>('/billing/quotes/'+id+'/convert',post(key,{idempotency_key:key})),
 orders:(scope:OwnerScope)=>request<ApiResponse<{orders:Order[]}>>(ownerPath(scope,'orders')),
 order:(id:number)=>request<ApiResponse<{order:Order}>>('/billing/orders/'+id),
 cancelOrder:(id:number)=>request<ApiResponse<{order:Order}>>('/billing/orders/'+id+'/cancel',{method:'POST',body:{}}),
 prices:(key:string)=>request<ApiResponse<PlanPrices>>('/platform/billing/plans/'+encodeURIComponent(key)+'/prices'),
 publishPrices:(versionId:number,amounts:Partial<Record<Period,number>>)=>request<ApiResponse<{version:{id:number;version:number;published_at:string|null}}>>('/platform/billing/plan-versions/'+versionId+'/publish-prices',
  {method:'POST',body:Object.fromEntries(Object.entries(amounts).map(([p,n])=>[p+'_amount_toman',n]))}),
 taxes:()=>request<ApiResponse<{rules:TaxRule[]}>>('/platform/billing/tax-rules'),
 createTax:(data:{label:string;rate_basis_points:number;activate:boolean})=>request<ApiResponse<{rule:TaxRule}>>('/platform/billing/tax-rules',{method:'POST',body:data}),
 activateTax:(id:number)=>request<ApiResponse<{rule:TaxRule}>>('/platform/billing/tax-rules/'+id+'/activate',{method:'POST',body:{}}),
 deactivateTax:(id:number)=>request<ApiResponse<{rule:TaxRule}>>('/platform/billing/tax-rules/'+id+'/deactivate',{method:'POST',body:{}}),
 promotions:()=>request<ApiResponse<{promotions:Promotion[]}>>('/platform/billing/promotions'),
 createPromo:(data:{code:string;label:string;discount_type:'fixed'|'percent';discount_value_bp?:number;discount_value_toman?:number})=>request<ApiResponse<{promotion:Promotion}>>('/platform/billing/promotions',{method:'POST',body:data}),
 deactivatePromo:(id:number)=>request<ApiResponse<{promotion:Promotion}>>('/platform/billing/promotions/'+id+'/deactivate',{method:'POST',body:{}}),
};
