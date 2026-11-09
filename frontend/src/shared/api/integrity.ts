import { request } from './client';
import type { IntegrityFinding } from '../types';
export type IntegrityResponse = {data:IntegrityFinding[];meta:{current_page:number;last_page:number;per_page:number;total:number;summary:{critical:number;warning:number;info:number};readOnly:true}};
export const integrityApi = { list:(severity?:string,page=1)=>request<IntegrityResponse>(`/integrity?page=${page}${severity?`&severity=${encodeURIComponent(severity)}`:''}`) };
