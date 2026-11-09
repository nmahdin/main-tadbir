export type SubscriptionLimit={resource_key:string;limit_value:number|null;is_unlimited:boolean;usage:number|null};
export type UsageAssessment='unlimited'|'unknown'|'over'|'full'|'within';
export function assessUsage(limit:SubscriptionLimit):UsageAssessment{
 if(limit.is_unlimited)return 'unlimited';
 if(limit.usage===null||limit.limit_value===null)return 'unknown';
 if(limit.usage>limit.limit_value)return 'over';
 if(limit.usage===limit.limit_value)return 'full';
 return 'within';
}
