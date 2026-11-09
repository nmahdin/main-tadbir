import type {Period,Quote,Order,OwnerScope,OwnedSnapshot} from './commercialApi';
export const PERIODS:Period[]=['monthly','quarterly','annual'];
export const PERIOD_LABELS:Record<Period,string>={monthly:'ماهانه',quarterly:'سه‌ماهه',annual:'سالانه'};
export const convertible=(q:Quote)=>q.status==='open'&&q.remaining_seconds>0;
export const cancellable=(o:Order)=>o.status==='in_review'&&o.review_remaining_seconds>0;
export const owns=(v:OwnedSnapshot,s:OwnerScope)=>s.kind==='organization'?v.organization_id===s.organizationId:v.organization_id===null&&v.personal_workspace_id!==null;
