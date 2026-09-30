import { ApiResponse, request } from './client';

/**
 * تنظیمات سیستمی سازمان (کلید/مقدار). هر کلید یک آرایه یا شیء کامل است:
 * انواع محتوا، دسته‌ها، الگوهای فرایند، پلتفرم‌های انتشار، گردش‌کارها،
 * هویت سازمان، اعلان‌ها، امنیت و اولویت‌های وظایف.
 */
export type SystemSettingKey =
  | 'content_types'
  | 'target_audiences'
  | 'categories'
  | 'process_templates'
  | 'publishing_platforms'
  | 'workflows'
  | 'general'
  | 'notifications'
  | 'security'
  | 'task_priorities'
  | 'task_statuses'
  | 'dam_statuses'
  | 'content_statuses';

export const settingsApi = {
  publicIdentity() {
    return request<ApiResponse<{ orgName: string; loginDescription: string; themeColor: string }>>('/public/identity');
  },

  all() {
    return request<ApiResponse<Partial<Record<SystemSettingKey, unknown>>>>('/settings');
  },

  get<T = unknown[]>(key: SystemSettingKey) {
    return request<ApiResponse<{ key: SystemSettingKey; value: T | null }>>(`/settings/${key}`);
  },

  update<T = unknown[]>(key: SystemSettingKey, value: T) {
    return request<ApiResponse<{ key: SystemSettingKey; value: T }>>(`/settings/${key}`, {
      method: 'PUT',
      body: { value },
    });
  },
};
