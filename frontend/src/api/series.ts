import { ApiCollection, ApiResponse, request } from './client';
import type { Content, ContentSeries, SeriesPeriodPreview } from '../types';

const qs = (params: Record<string, unknown> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key,value]) => { if (value !== undefined && value !== null && value !== '') query.set(key,String(value)); });
  return query.size ? `?${query}` : '';
};
export type SeriesInput = {
  name: string; description?: string; codePrefix?: string | null; contentType: string;
  projectId?: string | null; departmentId?: string | null; ownerId?: string | null;
  processTemplateId?: string | null; status?: 'active'|'paused';
  recurrenceType: 'weekly'|'monthly'|'project_based'|'manual';
  recurrenceConfig?: {startDate?:string;interval?:number;deadlineOffsetDays?:number};
  defaultContentPayload?: Partial<Content>; defaultPublicationConfig?: Record<string,unknown>;
};
export const seriesApi = {
  list: (params: Record<string,unknown> = {}) => request<ApiCollection<ContentSeries>>(`/content-series${qs(params)}`),
  get: (id:string) => request<ApiResponse<ContentSeries>>(`/content-series/${id}`),
  create: (body:SeriesInput) => request<ApiResponse<ContentSeries>>('/content-series',{method:'POST',body}),
  update: (id:string,body:Partial<SeriesInput>) => request<ApiResponse<ContentSeries>>(`/content-series/${id}`,{method:'PATCH',body}),
  archive: (id:string) => request<ApiResponse<ContentSeries>>(`/content-series/${id}`,{method:'DELETE'}),
  preview: (id:string) => request<ApiResponse<SeriesPeriodPreview>>(`/content-series/${id}/next-preview`),
  createNext: (id:string,periodKey:string) => request<ApiResponse<Content>>(`/content-series/${id}/occurrences/next`,{method:'POST',body:{periodKey}}),
  batch: (id:string,count:number,requestKey:string) => request<ApiResponse<Content[]>>(`/content-series/${id}/occurrences/batch`,{method:'POST',body:{count,requestKey}}),
  occurrences: (id:string,params:Record<string,unknown>={}) => request<ApiCollection<Content>>(`/content-series/${id}/occurrences${qs(params)}`),
  summary: (id:string) => request<ApiResponse<{total:number;published:number;inProgress:number;producing:number;waitingReview:number;readyPublish:number;overdue:number;planned:number;archived:number;latestCode?:string;next:SeriesPeriodPreview}>>(`/content-series/${id}/summary`),
};
