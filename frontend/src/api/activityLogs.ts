import { ActivityLog } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type ActivityLogPayload = Omit<ActivityLog, 'id' | 'timestamp'> & { timestamp?: string };

export const activityLogsApi = {
  list() {
    return request<ApiCollection<ActivityLog>>('/activity-logs?per_page=100');
  },

  create(payload: ActivityLogPayload) {
    return request<ApiResponse<ActivityLog>>('/activity-logs', { method: 'POST', body: payload });
  },
};
