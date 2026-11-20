import {request,type ApiResponse} from '../../shared/api/client';
import type {OwnerScope,Period} from './commercialApi';
export type Payment={id:number;order_id:number;provider:string;status:string;requested_amount_toman:number;verified_amount_toman:number|null;currency:string;initiated_at:string|null;verified_at:string|null;finalized_at:string|null;fulfilled_at:string|null;failure_code:string|null;failure_reason:string|null};
export type Subscription={id:number;state:string;plan_key:string;plan_version:number;billing_period:Period|null;starts_at:string|null;expires_at:string|null;grace_ends_at:string|null;entitlements:Record<string,unknown>;limits:{key:string;limit_value:number|null;is_unlimited:boolean}[]};
export type FinancialDocument={id:number;type:'invoice'|'receipt';status:string;number:string;owner_key:string;order_id:number;payment_id:number|null;related_invoice_id:number|null;currency:string;subtotal_toman:number;discount_toman:number;tax_toman:number;total_toman:number;issued_at:string|null;voided_at:string|null};
export type DocumentRender={doc_number:string;doc_type:'invoice'|'receipt';status:string;issued_at:string|null;seller:{name:string;tax_id:string|null};buyer:{name:string;contact:string|null};plan:{name:string;version_id:number;period:Period};currency:string;items:{kind:string;description:string;quantity:number;amount_toman:number;unit_amount_toman:number}[];totals:{subtotal_toman:number;discount_toman:number;tax_toman:number;total_toman:number};tax_rate:string|null;promo_code:string|null;payment:{provider:string;transaction_id:string|null}|null;notes:string|null};
export type Finding={id:number;finding_type:string;subject_type:string;subject_id:number;severity:string;status:string;message:string;safe_to_retry:boolean;owner_key:string;related_payment_id:number|null;related_order_id:number|null;detected_at:string|null;resolved_at:string|null;resolution_note:string|null};
const ownerSuffix=(s:OwnerScope)=>s.kind==='organization'?'/organizations/'+s.organizationId:'';
const query=(p:Record<string,string|number|undefined>)=>{const u=new URLSearchParams();Object.entries(p).forEach(([k,v])=>{if(v!==undefined&&v!=='')u.set(k,String(v));});return '?'+u.toString();};
export const commercialFlowsApi={
 initiatePayment:(orderId:number,key:string)=>request<ApiResponse<{payment:Payment;redirect_url:string|null;is_replay:boolean}>>('/billing/orders/'+orderId+'/pay',{method:'POST',headers:{'Idempotency-Key':key},body:{idempotency_key:key}}),
 payment:(id:number)=>request<ApiResponse<{payment:Payment}>>('/billing/payments/'+id),
 reconcilePayment:(id:number)=>request<ApiResponse<{payment:Payment;outcome:string}>>('/billing/payments/'+id+'/reconcile',{method:'POST',body:{}}),
 subscription:(scope:OwnerScope)=>request<ApiResponse<{subscription:Subscription|null}>>('/billing/subscription'+ownerSuffix(scope)),
 documents:(scope:OwnerScope,type?:string,orderId?:number)=>request<ApiResponse<{documents:FinancialDocument[]}>>('/billing/documents'+ownerSuffix(scope)+query({type,order_id:orderId})),
 document:(id:number)=>request<ApiResponse<{document:FinancialDocument}>>('/billing/documents/'+id),
 renderDocument:(id:number)=>request<ApiResponse<{render:DocumentRender}>>('/billing/documents/'+id+'/render'),
 findings:(status?:string)=>request<ApiResponse<{findings:Finding[]}>>('/platform/billing/findings'+query({status})),
 finding:(id:number)=>request<ApiResponse<{finding:Finding&{evidence?:unknown}}>>('/platform/billing/findings/'+id),
 resolveFinding:(id:number,note:string)=>request<ApiResponse<{finding:Finding}>>('/platform/billing/findings/'+id+'/resolve',{method:'POST',body:{resolution_note:note}}),
 reconciliationSweep:()=>request<ApiResponse<{summary:{opened:number;resolved:number;total_open:number}}>>('/platform/billing/reconcile',{method:'POST',body:{}}),
 platformPlans:()=>request<ApiResponse<{plans:{id:number;key:string;name:string;status:string}[]}>>('/platform/billing/plans'),
};
export const confirmedPayment=(p:Payment)=>['paid','fulfilled','zero_settled'].includes(p.status);
export const fulfilledPayment=(p:Payment)=>p.status==='fulfilled'||p.fulfilled_at!==null;
export function safeProviderUrl(value:string|null):string|null{
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}
}
