import {request,uploadRequest,downloadRequest,type ApiResponse, type ApiCollection} from '../../shared/api/client';
export type Action={id:number;origin_key:string;origin_module:string;origin_type:string;origin_id:number;action_kind:string;urgency:string;title:string;summary:string|null;deep_link:string|null;due_at:string|null;allowed_actions:string[];recipient_scope:'personal'|'organization';organization_id:number|null;is_overdue:boolean;resolved_at:string|null;created_at:string|null};
export type ActionList=ApiCollection<Action>&{meta?:{current_page?:number;last_page?:number;per_page?:number;total?:number;unresolved_count?:number}};
export type SystemDelivery={delivery_id:number;message_id:number;version:number;slug:string;title:string;body_markdown:string;cta_label:string;cta_link:string|null;category:string|null;audience:'platform'|'personal'|'organization';ack_required:boolean;first_delivered_at:string|null;read_at:string|null;acknowledged_at:string|null};
export type PendingAck={delivery_id:number;message_id:number;version:number;slug:string;title:string;body_markdown:string;ack_policy_version:string|null};
export type AdminMessage={id:number;slug:string;version:number;audience:'platform'|'personal'|'organization';title:string;category:string|null;ack_required:boolean;status:string;published_at:string|null;created_at:string|null};
export type SupportSummary={id:number;reference:string;subject:string;category:string;status:string;priority:string;owner_user_id?:number;assigned_user_id?:number|null;owner?:{id:number;name:string}|null;assignee?:{id:number;name:string}|null;created_at:string|null;last_replied_at:string|null};
export type SupportReply={id:number;author_role:string;author_name:string|null;body:string;attachments:{attachment_id:number;name:string;access_token:string}[]|null;internal_note:boolean;created_at:string|null};
export type SupportActivity={id:number;event_type:string;payload:Record<string,unknown>|null;actor_name:string|null;created_at:string|null};
export type SupportDetail=SupportSummary&{messages:SupportReply[];activity:SupportActivity[]};
const qs=(filters:Record<string,string|number|undefined>)=>{const s=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v!==undefined&&v!=='')s.set(k,String(v));});return '?'+s.toString();};
export const sharedServicesApi={
 actions:(status:string,page=1)=>request<ActionList>('/me/inbox'+qs({status,page})),
 action:(id:number)=>request<ApiResponse<Action>>('/me/inbox/'+id),
 dismissAction:(id:number)=>request<ApiResponse<Action>>('/me/inbox/'+id+'/dismiss',{method:'POST',body:{}}),
 messages:(unread=false,page=1)=>request<ApiCollection<SystemDelivery>>('/me/messages'+qs({unread:unread?'1':undefined,page})),
 pendingAcks:()=>request<ApiCollection<PendingAck>>('/me/messages/pending-ack'),
 markRead:(id:number)=>request<ApiResponse<{delivery_id:number;read_at:string|null}>>('/me/messages/'+id+'/read',{method:'POST',body:{}}),
 acknowledge:(id:number)=>request<ApiResponse<{delivery_id:number;acknowledged_at:string|null;evidence_hash:string|null}>>('/me/messages/'+id+'/acknowledge',{method:'POST',body:{}}),
 adminMessages:(status:string)=>request<ApiCollection<AdminMessage>>('/platform/messages'+qs({status})),
 createMessage:(body:{slug:string;title:string;body_markdown:string;audience:string;organization_id?:number;ack_required:boolean;ack_policy_version?:string;publish:boolean;bump_version:boolean})=>request<ApiResponse<{id:number;slug:string;version:number;status:string}>>('/platform/messages',{method:'POST',body}),
 publishMessage:(id:number)=>request<ApiResponse<{id:number;status:string}>>('/platform/messages/'+id+'/publish',{method:'POST',body:{}}),
 retireMessage:(id:number)=>request<ApiResponse<{id:number;status:string}>>('/platform/messages/'+id+'/retire',{method:'POST',body:{}}),
 messageDeliveries:(id:number)=>request<ApiCollection<{id:number;user_id:number;read_at:string|null;acknowledged_at:string|null;first_delivered_at:string|null}>>('/platform/messages/'+id+'/deliveries'),
 tickets:()=>request<ApiCollection<SupportSummary>>('/support/tickets'),
 ticket:(id:number)=>request<ApiResponse<SupportDetail>>('/support/tickets/'+id),
 createTicket:(body:{subject:string;category:string;body:string})=>request<ApiResponse<SupportSummary>>('/support/tickets',{method:'POST',body}),
 reply:(id:number,body:string,internal_note=false)=>request<ApiResponse<SupportSummary>>('/support/tickets/'+id+'/replies',{method:'POST',body:{body,internal_note}}),
 replyWithAttachments:(id:number,body:string,files:File[],internalNote=false)=>{const data=new FormData();data.set('body',body);data.set('internal_note',internalNote?'1':'0');files.forEach(f=>data.append('attachments[]',f));return uploadRequest<ApiResponse<SupportSummary>>('/support/tickets/'+id+'/replies',data);},
 downloadAttachment:(token:string)=>downloadRequest('/support/attachments/'+encodeURIComponent(token)),
 queue:(priority:string)=>request<ApiCollection<SupportSummary>>('/platform/support/queue'+qs({priority})),
 claim:(id:number,userId:number)=>request<ApiResponse<{id:number;assigned_user_id:number|null}>>('/platform/support/tickets/'+id+'/assign',{method:'POST',body:{user_id:userId}}),
 assign:(id:number,userId:number|null)=>request<ApiResponse<{id:number;assigned_user_id:number|null}>>('/platform/support/tickets/'+id+'/assign',{method:'POST',body:{user_id:userId}}),
 status:(id:number,status:string)=>request<ApiResponse<{id:number;status:string}>>('/platform/support/tickets/'+id+'/status',{method:'POST',body:{status}}),
};
export {safeInternalActionPath} from './sharedServicesRules';
