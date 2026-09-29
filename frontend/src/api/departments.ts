import { Department } from '../types';
import { ApiResponse, request } from './client';

export type DepartmentPayload = Partial<Omit<Department, 'id' | 'createdAt'>> & {
  name: string;
};

export interface DepartmentMigrationStatus { installed: boolean; phase: string; after: number; }

export const departmentsApi = {
  migrationStatus: () => request<ApiResponse<DepartmentMigrationStatus>>('/departments/consolidation'),
  migrateBatch: () => request<ApiResponse<DepartmentMigrationStatus>>('/departments/consolidation', { method: 'POST', body: { confirm: true } }),
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
