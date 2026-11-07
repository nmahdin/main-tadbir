import { ProjectTemplate } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type ProjectTemplatePayload = Partial<Omit<ProjectTemplate, 'id' | 'createdAt' | 'updatedAt'>> & {
  name: string;
};

export const projectTemplatesApi = {
  list() {
    return request<ApiCollection<ProjectTemplate>>('/project-templates?per_page=100');
  },

  create(payload: ProjectTemplatePayload) {
    return request<ApiResponse<ProjectTemplate>>('/project-templates', { method: 'POST', body: payload });
  },

  update(id: string, payload: Partial<ProjectTemplatePayload>) {
    return request<ApiResponse<ProjectTemplate>>(`/project-templates/${id}`, { method: 'PUT', body: payload });
  },

  remove(id: string) {
    return request<void>(`/project-templates/${id}`, { method: 'DELETE' });
  },
};
