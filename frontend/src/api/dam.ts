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
    createFile(file: File, metadata: { title: string; description?: string; projectId?: string; folderId?: string; contentId?: string; contentBucket?: 'attachments' | 'inputs' | 'outputs' | 'final'; relationRole?: string; stageId?: string; outputId?: string; ideaId?: string; ideaTitle?: string; ideaKey?: string; meetingId?: string }) {
      const body = new FormData();
      body.append('file', file);
      body.append('title', metadata.title);
      if (metadata.contentId) body.append('content_id',metadata.contentId);
      if (metadata.contentBucket) body.append('content_bucket', metadata.contentBucket);
      if (metadata.relationRole) body.append('relation_role', metadata.relationRole);
      if (metadata.stageId) body.append('stage_id', metadata.stageId);
      if (metadata.outputId) body.append('output_id', metadata.outputId);
      if (metadata.folderId) body.append('folder_id', metadata.folderId);
      if (metadata.description) body.append('description', metadata.description);
      if (metadata.projectId && /^\d+$/.test(metadata.projectId)) body.append('project_id', metadata.projectId);
      if (metadata.ideaId && /^\d+$/.test(metadata.ideaId)) body.append('idea_id', metadata.ideaId);
      if (metadata.ideaTitle) body.append('idea_title', metadata.ideaTitle.slice(0, 255));
      if (metadata.ideaKey) body.append('idea_key', metadata.ideaKey);
      if (metadata.meetingId && /^\d+$/.test(metadata.meetingId)) body.append('meeting_id', metadata.meetingId);
      return request<ApiResponse<CentralDamAssetResponse>>('/dam/library', { method: 'POST', body });
    },
    createText(metadata: { title: string; body: string; description?: string; contentId?: string; contentBucket?: 'attachments' | 'inputs' | 'outputs' | 'final'; relationRole?: string; stageId?: string; outputId?: string }) {
      return request<ApiResponse<CentralDamAssetResponse>>('/dam/library', {
        method: 'POST',
        body: { title: metadata.title, body: metadata.body, description: metadata.description, content_id:metadata.contentId, content_bucket: metadata.contentBucket, relation_role: metadata.relationRole, stage_id: metadata.stageId, output_id: metadata.outputId },
      });
    },
    previewUrl(id: string | number) {
      return `${apiConfig.baseUrl}/dam/library/${id}/preview`;
    },
    /**
     * بندانگشتی سبک (دور ۸۴).
     *
     * پیش‌تر کارت‌ها و ردیف‌های ۴۰–۳۲۰ پیکسلی مخزن همین `previewUrl` (فایل
     * اصلی) را می‌گرفتند؛ یک فهرست بیست‌ردیفی از عکس‌های موبایلی می‌توانست
     * ده‌ها مگابایت شود. این مسیر نسخهٔ کوچکِ کش‌شده را می‌دهد (WebP در صورت
     * پشتیبانی سرور) و مرورگر آن را یک هفته نگه می‌دارد.
     */
    thumbnailUrl(id: string | number, width: 96 | 160 | 320 | 640 = 320) {
      return `${apiConfig.baseUrl}/dam/library/${id}/thumbnail?w=${width}`;
    },
    /**
     * ویرایش متن یک دارایی متنی = ساخت نسخهٔ تازه روی همان دارایی.
     * همان مسیری که «جزئیات دارایی» در مخزن استفاده می‌کند؛ تاریخ نسخه‌ها حفظ
     * می‌شود و متن قبلی از بین نمی‌رود.
     */
    /**
     * تغییر عنوان یک دارایی (مثلاً متن خروجی). عنوان همان چیزی است که در فهرست
     * مخزن، کارت خروجی مرحله و پیش‌نمایش دیده می‌شود؛ جدا از نسخهٔ متن ذخیره
     * می‌شود تا ویرایش عنوان نسخهٔ تازه نسازد.
     */
    updateTitle(id: string | number, title: string) {
      return request<ApiResponse<CentralDamAssetResponse>>(`/dam/library/${id}`, { method: 'PATCH', body: { title } });
    },
    reviseText(id: string | number, body: string, changeDescription?: string) {
      const form = new FormData();
      form.append('body', body);
      form.append('change_description', changeDescription || '');
      return request<ApiResponse<CentralDamAssetResponse>>(`/dam/library/${id}/versions`, { method: 'POST', body: form });
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
