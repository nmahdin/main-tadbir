import { ApiCollection, ApiResponse, request } from './client';

type WorkspaceRecord = { id: string; title?: string; subject?: string; status?: string };

const createWorkspaceRecordsApi = <T extends WorkspaceRecord>(path: string) => ({
  list() {
    return request<ApiCollection<T>>(`/${path}?per_page=100`);
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
export const thinkTankMeetingsApi = createWorkspaceRecordsApi<any>('think-tank-meetings');
export const secretariatLettersApi = createWorkspaceRecordsApi<any>('secretariat-letters');
export const secretariatResolutionsApi = createWorkspaceRecordsApi<any>('secretariat-resolutions');
export const archiveDossiersApi = createWorkspaceRecordsApi<any>('archive-dossiers');
