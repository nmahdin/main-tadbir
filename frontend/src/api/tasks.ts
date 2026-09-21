import { Task, TaskStatus } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type CreateTaskPayload = Omit<Partial<Task>, 'id' | 'createdAt' | 'updatedAt'> & {
  title: string;
  projectId: string;
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

export const tasksApi = {
  list(params?: TaskListParams) {
    return request<ApiCollection<Task>>(`/tasks${queryString(params)}`);
  },

  get(id: string) {
    return request<ApiResponse<Task>>(`/tasks/${id}`);
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
