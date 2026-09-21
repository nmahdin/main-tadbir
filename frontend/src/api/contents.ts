import { Content } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export const contentsApi = {
  list() {
    return request<ApiCollection<Content>>('/contents?per_page=100');
  },
  create(payload: Content) {
    return request<ApiResponse<Content>>('/contents', { method: 'POST', body: payload });
  },
  update(id: string, payload: Partial<Content>) {
    return request<ApiResponse<Content>>(`/contents/${id}`, { method: 'PATCH', body: payload });
  },
  remove(id: string) {
    return request<void>(`/contents/${id}`, { method: 'DELETE' });
  },
};
