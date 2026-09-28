import { ApiResponse, request } from './client';

/**
 * تنظیمات سیستمی سازمان (کلید/مقدار). هر کلید یک آرایه کامل است:
 * انواع محتوا، دسته‌بندی‌ها، الگوهای فرایند، پلتفرم‌های انتشار، گردش‌کارها.
 */
export type SystemSettingKey =
  | 'content_types'
  | 'categories'
  | 'process_templates'
  | 'publishing_platforms'
  | 'workflows';

export const settingsApi = {
  all() {
    return request<ApiResponse<Partial<Record<SystemSettingKey, unknown[]>>>>('/settings');
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
