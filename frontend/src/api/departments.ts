import { Content, Department, Project, Task } from '../types';
import { ApiResponse, request } from './client';

export type DepartmentPayload = Partial<Omit<Department, 'id' | 'createdAt'>> & {
  name: string;
};

export interface DepartmentMigrationStatus { installed: boolean; phase: string; after: number; }
export interface DepartmentDashboardData {
  department: Department;
  members: { id: string; name: string }[];
  projects: Project[];
  contents: Content[];
  tasks: Task[];
}

export const departmentsApi = {
  migrationStatus: () => request<ApiResponse<DepartmentMigrationStatus>>('/departments/consolidation'),
  migrateBatch: () => request<ApiResponse<DepartmentMigrationStatus>>('/departments/consolidation', { method: 'POST', body: { confirm: true } }),
  list() {
    return request<ApiResponse<Department[]>>('/departments');
  },

  dashboard(id: string) {
    return request<ApiResponse<DepartmentDashboardData>>(`/departments/${id}/dashboard`);
  },

  async directory(): Promise<ApiResponse<Department[]>> {
    const response = await request<ApiResponse<Array<Pick<Department, 'id' | 'name' | 'parentId' | 'managedByMe' | 'status'>>>>('/departments/directory');
    return {
      ...response,
      data: response.data.map(department => ({
        ...department,
        description: '',
        members: [],
        createdAt: '',
      })),
    };
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
