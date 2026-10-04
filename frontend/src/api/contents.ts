import { Content, Task } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type PublicationSettings = {
  expectedVersion: string;
  publisherId?: string | null;
  publishInfo: { date?: string | null; time?: string | null; channels?: string[]; caption?: string; status?: 'planned' | 'ready' };
};
export type PublicationTaskInput = { expectedVersion: string; title?: string; description?: string; assigneeId?: string; priority?: string; deadline?: string | null };
export const contentsApi = {
  forwardOutput: (id: string, stage: string, output: string, expectedVersion: string) => request<ApiResponse<Content>>(`/contents/${id}/stages/${encodeURIComponent(stage)}/outputs/${encodeURIComponent(output)}/forward`, { method: 'POST', body: { expectedVersion } }),
  decide: (id: string, stage: string, body: {decision: 'approve'|'reject'; note?: string; expectedVersion: string; correctionAssigneeId?: string}) => request<ApiResponse<Content>>(`/contents/${id}/stages/${encodeURIComponent(stage)}/decision`, {method:'POST',body}),
  get: (id: string) => request<ApiResponse<Content>>(`/contents/${id}`),
  publish: (id: string, expectedVersion: string) => request<ApiResponse<{ content: Content; tasks: Task[] }>>(`/contents/${id}/publish`, { method: 'POST', body: { expectedVersion } }),
  unpublish: (id: string, expectedVersion: string) => request<ApiResponse<{ content: Content; tasks: Task[] }>>(`/contents/${id}/unpublish`, { method: 'POST', body: { expectedVersion } }),
  schedule: (id: string, body: PublicationSettings) => request<ApiResponse<Content>>(`/contents/${id}/publication-settings`, { method: 'PUT', body }),
  createPublicationTask: (id: string, body: PublicationTaskInput) => request<ApiResponse<Task>>(`/contents/${id}/publication-task`, { method: 'POST', body }),
  watch: (id: string) => request<ApiResponse<{contentId:string;watching:boolean}>>(`/contents/${id}/watch`, { method: 'POST' }),
  unwatch: (id: string) => request<ApiResponse<{contentId:string;watching:boolean}>>(`/contents/${id}/watch`, { method: 'DELETE' }),
  list() {
    return request<ApiCollection<Content>>('/contents?per_page=100');
  },
  create(payload: Content) {
    return request<ApiResponse<Content>>('/contents', { method: 'POST', body: payload });
  },
  update(id: string, payload: Partial<Content>) {
    return request<ApiResponse<Content>>(`/contents/${id}`, { method: 'PATCH', body: payload });
  },
  /** آرشیو (پیش‌فرض حذف): تاریخچه، نسبت‌های DAM و تسک‌ها حفظ می‌شوند. */
  remove(id: string) {
    return request<void>(`/contents/${id}`, { method: 'DELETE' });
  },
  /** بازگرداندن محتوای آرشیوشده به آخرین وضعیت معتبر؛ idempotent است. */
  restore(id: string) {
    return request<ApiResponse<Content>>(`/contents/${id}/restore`, { method: 'POST' });
  },
  /** حذف نهایی: فقط برای مدیران دارای مجوز content.force_delete. */
  forceRemove(id: string) {
    return request<void>(`/contents/${id}/force`, { method: 'DELETE' });
  },
};
