import { Task, TaskStatus } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type CreateTaskPayload = Omit<Partial<Task>, 'id' | 'createdAt' | 'updatedAt'> & {
  title: string;
  projectId?: string;
  contentId?: string | null;
};

export type UpdateTaskPayload = Partial<CreateTaskPayload>;

export interface TaskListParams {
  page?: number;
  per_page?: number;
  project_id?: string;
  assignee_id?: string;
  status?: TaskStatus;
  search?: string;
}

const queryString = (params?: object) => {
  if (!params) return '';
  const query = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

/** نتیجهٔ یادآوری وظیفه (اعلان سامانه و ارسال بله در صورت اتصال). */
export interface TaskReminderResult {
  sent: boolean;
  throttled: boolean;
  reason?: string | null;
  recipient?: { id: string; name: string } | null;
  bale_linked?: boolean;
}

export const tasksApi = {
  list(params?: TaskListParams) {
    return request<ApiCollection<Task>>(`/tasks${queryString(params)}`);
  },

  get(id: string, signal?: AbortSignal) {
    return request<ApiResponse<Task>>(`/tasks/${id}`, { signal });
  },

  /**
   * یادآوری مسئول اجرا: اعلان سامانه + (در صورت اتصال حساب) پیام ربات بله.
   * سرور در هر ساعت بیش از یک یادآوری برای هر وظیفه نمی‌سازد و در آن حالت
   * پاسخ ۴۲۹ با پیام روشن برمی‌گرداند.
   */
  remind(id: string) {
    return request<ApiResponse<TaskReminderResult>>(`/tasks/${id}/reminder`, { method: 'POST' });
  },

  create(payload: CreateTaskPayload) {
    return request<ApiResponse<Task>>('/tasks', {
      method: 'POST',
      body: payload,
    });
  },

  update(id: string, payload: UpdateTaskPayload) {
    return request<ApiResponse<Task>>(`/tasks/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },

  moveStatus(id: string, status: TaskStatus) {
    return request<ApiResponse<Task>>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },

  remove(id: string) {
    return request<void>(`/tasks/${id}`, { method: 'DELETE' });
  },
};
