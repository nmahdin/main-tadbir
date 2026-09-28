import { AppNotification } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export const notificationsApi = {
  list() {
    return request<ApiCollection<AppNotification>>('/notifications?per_page=200');
  },

  create(payload: Omit<AppNotification, 'timestamp' | 'read'> & Partial<Pick<AppNotification, 'read'>>) {
    return request<ApiResponse<AppNotification>>('/notifications', { method: 'POST', body: payload });
  },

  update(id: string, payload: Partial<AppNotification>) {
    return request<ApiResponse<AppNotification>>(`/notifications/${id}`, { method: 'PUT', body: payload });
  },

  remove(id: string) {
    return request<void>(`/notifications/${id}`, { method: 'DELETE' });
  },
};
