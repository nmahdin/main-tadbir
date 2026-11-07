import { AppNotification } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

/** توصیف زندهٔ اعلان‌ها برای تب تنظیمات: دسته‌بندی رسمی، شمار واقعی و وضعیت کانال‌ها. */
export interface NotificationOverview {
  categories: { id: NotificationCategory; label: string; description: string; types: string[]; total: number; unread: number }[];
  totals: { all: number; unread: number };
  recent: { id: string; title: string; category: string; type: string; read: boolean; at: string | null }[];
  bale: { linked: boolean; enabled: boolean; ready: boolean; enabled_categories: string[]; all_categories: string[] };
  policy: { deadlineReminders: boolean; mentionAlerts: boolean };
}

/** دسته‌های رسمی اعلان در سرور و کلاینت یکی است. */
export type NotificationCategory = 'tasks' | 'content' | 'meetings' | 'secretariat' | 'collaboration' | 'system';

export const notificationsApi = {
  readAll: () => request('/notifications/read-all', { method: 'POST' }),

  overview() {
    return request<ApiResponse<NotificationOverview>>('/notifications/overview');
  },

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
