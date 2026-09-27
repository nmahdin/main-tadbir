import { Department } from '../types';
import { ApiResponse, request } from './client';

export type DepartmentPayload = Partial<Omit<Department, 'id' | 'createdAt'>> & {
  name: string;
};

export const departmentsApi = {
  list() {
    return request<ApiResponse<Department[]>>('/departments');
  },

  create(payload: DepartmentPayload) {
    return request<ApiResponse<Department>>('/departments', { method: 'POST', body: payload });
  },

  update(id: string, payload: Partial<DepartmentPayload>) {
    return request<ApiResponse<Department>>(`/departments/${id}`, { method: 'PUT', body: payload });
  },

  remove(id: string) {
    return request<void>(`/departments/${id}`, { method: 'DELETE' });
  },
};
