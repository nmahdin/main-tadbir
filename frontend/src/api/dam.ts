import { DigitalAsset, AssetFolder } from '../types';
import { ApiCollection, ApiResponse, apiConfig, request } from './client';

export interface CentralDamAssetResponse {
  id: number | string;
  title: string;
  type: 'file' | 'content';
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
}

export const damApi = {
  library: {
    createFile(file: File, metadata: { title: string; description?: string; projectId?: string; folderId?: string; contentId?: string; contentBucket?: 'attachments' | 'outputs' }) {
      const body = new FormData();
      body.append('file', file);
      body.append('title', metadata.title);
      if (metadata.contentId) body.append('content_id',metadata.contentId);
      if (metadata.contentBucket) body.append('content_bucket', metadata.contentBucket);
      if (metadata.folderId) body.append('folder_id', metadata.folderId);
      if (metadata.description) body.append('description', metadata.description);
      if (metadata.projectId && /^\d+$/.test(metadata.projectId)) body.append('project_id', metadata.projectId);
      return request<ApiResponse<CentralDamAssetResponse>>('/dam/library', { method: 'POST', body });
    },
    createText(metadata: { title: string; body: string; description?: string; contentId?: string; contentBucket?: 'attachments' | 'outputs' }) {
      return request<ApiResponse<CentralDamAssetResponse>>('/dam/library', {
        method: 'POST',
        body: { title: metadata.title, body: metadata.body, description: metadata.description, content_id:metadata.contentId, content_bucket: metadata.contentBucket },
      });
    },
    previewUrl(id: string | number) {
      return `${apiConfig.baseUrl}/dam/library/${id}/preview`;
    },
  },
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
