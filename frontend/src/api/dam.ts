import { DigitalAsset, AssetFolder } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export const damApi = {
  folders: {
    list() {
      return request<ApiCollection<AssetFolder>>('/dam/folders?per_page=200');
    },
    create(payload: Partial<AssetFolder> & { name: string }) {
      return request<ApiResponse<AssetFolder>>('/dam/folders', { method: 'POST', body: payload });
    },
    update(id: string, payload: Partial<AssetFolder>) {
      return request<ApiResponse<AssetFolder>>(`/dam/folders/${id}`, { method: 'PUT', body: payload });
    },
    remove(id: string) {
      return request<void>(`/dam/folders/${id}`, { method: 'DELETE' });
    },
  },

  assets: {
    list() {
      return request<ApiCollection<DigitalAsset>>('/dam/assets?per_page=200');
    },
    create(payload: Partial<DigitalAsset> & { title: string; fileName: string; size: number }) {
      return request<ApiResponse<DigitalAsset>>('/dam/assets', { method: 'POST', body: payload });
    },
    update(id: string, payload: Partial<DigitalAsset>) {
      return request<ApiResponse<DigitalAsset>>(`/dam/assets/${id}`, { method: 'PUT', body: payload });
    },
    remove(id: string) {
      return request<void>(`/dam/assets/${id}`, { method: 'DELETE' });
    },
    removeMany(ids: string[]) {
      return request<void>('/dam/assets/batch-delete', { method: 'POST', body: { ids } });
    },
  },
};
