import { ActivityLog } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type ActivityLogPayload = Omit<ActivityLog, 'id' | 'timestamp'> & { timestamp?: string };

export type ActivityLogListParams = { page?: number; perPage?: number; userId?: string; type?: string; from?: string; to?: string };

export const activityLogsApi = {
  list(params: ActivityLogListParams = {}) {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      per_page: String(params.perPage || 100),
    });
    if (params.userId) query.set('user_id', params.userId);
    if (params.type) query.set('type', params.type);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    return request<ApiCollection<ActivityLog>>(`/activity-logs?${query}`);
  },

  create(payload: ActivityLogPayload) {
    return request<ApiResponse<ActivityLog>>('/activity-logs', { method: 'POST', body: payload });
  },
};
