import { Project } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type CreateProjectPayload = Omit<Partial<Project>, 'id' | 'createdAt' | 'updatedAt'> & {
  name: string;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload>;

export interface ProjectListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  priority?: string;
  project_manager_id?: string;
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

export const projectsApi = {
  list(params?: ProjectListParams) {
    return request<ApiCollection<Project>>(`/projects${queryString(params)}`);
  },

  get(id: string) {
    return request<ApiResponse<Project>>(`/projects/${id}`);
  },

  create(payload: CreateProjectPayload) {
    return request<ApiResponse<Project>>('/projects', {
      method: 'POST',
      body: payload,
    });
  },

  update(id: string, payload: UpdateProjectPayload) {
    return request<ApiResponse<Project>>(`/projects/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },

  remove(id: string) {
    return request<void>(`/projects/${id}`, { method: 'DELETE' });
  },
};
