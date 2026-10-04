import { ApiCollection, ApiResponse, request } from './client';

type WorkspaceRecord = { id: string; title?: string; subject?: string; status?: string };

const createWorkspaceRecordsApi = <T extends WorkspaceRecord>(path: string) => ({
  list(params?: {project_id?: string; page?: number; per_page?: number; search?: string}) {
    const query = new URLSearchParams({ per_page: String(params?.per_page || 100) });
    if (params?.project_id) query.set('project_id', params.project_id);
    if (params?.page) query.set('page', String(params.page));
    if (params?.search) query.set('search', params.search);
    return request<ApiCollection<T>>(`/${path}?${query}`);
  },

  get(id: string) {
    return request<ApiResponse<T>>(`/${path}/${id}`);
  },

  create(payload: Omit<T, 'id'> | T) {
    return request<ApiResponse<T>>(`/${path}`, { method: 'POST', body: payload });
  },

  update(id: string, payload: Partial<T>) {
    return request<ApiResponse<T>>(`/${path}/${id}`, { method: 'PUT', body: payload });
  },

  remove(id: string) {
    return request<void>(`/${path}/${id}`, { method: 'DELETE' });
  },
});

export const ideasApi = createWorkspaceRecordsApi<any>('ideas');
export const thinkTankMeetingsApi = {
  ...createWorkspaceRecordsApi<any>('think-tank-meetings'),
  createGoogleMeet(id: string) {
    return request<ApiResponse<any>>(`/think-tank-meetings/${id}/google-meet`, { method: 'POST' });
  },
};
export const secretariatLettersApi = createWorkspaceRecordsApi<any>('secretariat-letters');
export const secretariatResolutionsApi = createWorkspaceRecordsApi<any>('secretariat-resolutions');
export const archiveDossiersApi = createWorkspaceRecordsApi<any>('archive-dossiers');
