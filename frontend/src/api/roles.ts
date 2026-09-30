import { SystemRole } from '../types';
import { ApiResponse, request } from './client';

export type RolePayload = Partial<Omit<SystemRole, 'id' | 'createdAt'>> & {
  name: string;
  key: string;
};

export const rolesApi = {
  list() {
    return request<ApiResponse<SystemRole[]>>('/roles');
  },

  create(payload: RolePayload) {
    return request<ApiResponse<SystemRole>>('/roles', { method: 'POST', body: payload });
  },

  update(id: string, payload: Partial<RolePayload>) {
    return request<ApiResponse<SystemRole>>(`/roles/${id}`, { method: 'PUT', body: payload });
  },

  updatePermissions(roles: { id: string; permissions: string[] }[]) {
    return request<ApiResponse<SystemRole[]>>('/roles/permissions', {
      method: 'PUT',
      body: { roles },
    });
  },

  remove(id: string) {
    return request<void>(`/roles/${id}`, { method: 'DELETE' });
  },
};
