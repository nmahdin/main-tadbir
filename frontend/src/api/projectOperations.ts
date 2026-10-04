import { ApiCollection, ApiResponse, request } from './client';
import type { ActivityLog, Content, ContentSeries, Idea, ProjectContentPlan, Task, ThinkTankMeeting } from '../types';
const qs=(p:Record<string,unknown>={})=>{const q=new URLSearchParams();Object.entries(p).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v));});return q.size?`?${q}`:''};
export type ProjectOperationsSummary = {progress:number;contents:number;publishedContents:number;series:number;tasks:number;completedTasks:number;assets:number;ideas:number;meetings:number;activities:number;activeContents:number;openTasks:number;overdueTasks:number;readyPublish:number;latestActivities:Array<{id:string;action:string;type:string;timestamp:string;metadata?:Record<string,unknown>}>};
export const projectOperationsApi = {
  summary:(projectId:string)=>request<ApiResponse<ProjectOperationsSummary>>(`/projects/${projectId}/operations/summary`),
  contents:(projectId:string,p={})=>request<ApiCollection<Content>>(`/projects/${projectId}/operations/contents${qs(p)}`),
  series:(projectId:string,p={})=>request<ApiCollection<ContentSeries>>(`/projects/${projectId}/operations/series${qs(p)}`),
  tasks:(projectId:string,p={})=>request<ApiCollection<Task>>(`/projects/${projectId}/operations/tasks${qs(p)}`),
  ideas:(projectId:string,p={})=>request<ApiCollection<Idea>>(`/projects/${projectId}/operations/ideas${qs(p)}`),
  meetings:(projectId:string,p={})=>request<ApiCollection<ThinkTankMeeting>>(`/projects/${projectId}/operations/meetings${qs(p)}`),
  activities:(projectId:string,p={})=>request<ApiCollection<ActivityLog>>(`/projects/${projectId}/operations/activities${qs(p)}`),
  plans:(projectId:string)=>request<ApiCollection<ProjectContentPlan>>(`/projects/${projectId}/content-plan`),
  savePlan:(projectId:string,body:Partial<ProjectContentPlan>&{contentType:string;plannedCount:number})=>request<ApiResponse<ProjectContentPlan>>(`/projects/${projectId}/content-plan`,{method:'POST',body}),
  updatePlan:(projectId:string,id:string,body:Partial<ProjectContentPlan>)=>request<ApiResponse<ProjectContentPlan>>(`/projects/${projectId}/content-plan/${id}`,{method:'PATCH',body}),
  deletePlan:(projectId:string,id:string)=>request<void>(`/projects/${projectId}/content-plan/${id}`,{method:'DELETE'}),
};
