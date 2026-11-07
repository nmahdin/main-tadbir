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
  | 'idea_categories'
  | 'process_templates'
  | 'publishing_platforms'
  | 'workflows'
  | 'general'
  | 'notifications'
  | 'security'
  | 'task_priorities'
  | 'task_statuses'
  | 'dam_statuses'
  | 'content_statuses'
  | 'google_meet'
  | 'maintenance';

export const settingsApi = {
  publicIdentity() {
    return request<ApiResponse<{
      orgName: string;
      loginDescription: string;
      themeColor: string;
      secondaryColor?: string;
      /** مسیر لوگو/فاوآیکون سامانه روی دیسک عمومی. */
      logoUrl?: string;
      faviconUrl?: string;
      /** وضعیت تعمیر؛ صفحهٔ ورود پیش از احراز هویت آن را نشان می‌دهد. */
      maintenance?: { enabled: boolean; message: string; startedAt?: string | null };
    }>>('/public/identity');
  },

  all() {
    return request<ApiResponse<Partial<Record<SystemSettingKey, unknown>>>>('/settings');
  },

  get<T = unknown[]>(key: SystemSettingKey) {
    return request<ApiResponse<{ key: SystemSettingKey; value: T | null }>>(`/settings/${key}`);
  },

  /**
   * بارگذاری لوگو یا فاوآیکون سامانه.
   *
   * فایل روی دیسک عمومی ذخیره می‌شود و مسیر نسبی برمی‌گردد؛ ذخیرهٔ نهایی همان
   * PUT تنظیمات `general` است تا مسیر نوشتن تنظیمات یکی بماند.
   */
  uploadBranding(kind: 'logo' | 'favicon', file: File) {
    const body = new FormData();
    body.append('file', file);
    return request<ApiResponse<{ kind: 'logo' | 'favicon'; url: string }>>(`/settings/branding/${kind}`, {
      method: 'POST',
      body,
    });
  },

  update<T = unknown[]>(key: SystemSettingKey, value: T) {
    return request<ApiResponse<{ key: SystemSettingKey; value: T }>>(`/settings/${key}`, {
      method: 'PUT',
      body: { value },
    });
  },
};
