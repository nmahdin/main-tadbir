import { Content, Task } from '../types';
import { normalizeContent, normalizeContents } from '../utils/contentNormalize';
import { ApiCollection, ApiResponse, request } from './client';

/**
 * هر پاسخ محتوا پیش از رسیدن به رابط نرمال می‌شود؛ پرونده‌های قدیمی ساختار ناقص
 * دارند و نباید رندر صفحه را با استثنا متوقف کنند.
 */
const contentResponse = (response: ApiResponse<Content>): ApiResponse<Content> =>
  ({ ...response, data: normalizeContent(response.data) });
const contentPairResponse = (response: ApiResponse<{ content: Content; tasks: Task[] }>): ApiResponse<{ content: Content; tasks: Task[] }> =>
  ({ ...response, data: { ...response.data, content: normalizeContent(response.data.content) } });

export type PublicationSettings = {
  expectedVersion: string;
  publisherId?: string | null;
  publishInfo: { date?: string | null; time?: string | null; channels?: string[]; caption?: string; status?: 'planned' | 'ready' };
};
export type PublicationTaskInput = { expectedVersion: string; title?: string; description?: string; assigneeId?: string; priority?: string; deadline?: string | null };
export const contentsApi = {
  forwardOutput: (id: string, stage: string, output: string, expectedVersion: string) => request<ApiResponse<Content>>(`/contents/${id}/stages/${encodeURIComponent(stage)}/outputs/${encodeURIComponent(output)}/forward`, { method: 'POST', body: { expectedVersion } }).then(contentResponse),
  decide: (id: string, stage: string, body: {decision: 'approve'|'reject'; note?: string; expectedVersion: string; correctionAssigneeId?: string}) => request<ApiResponse<Content>>(`/contents/${id}/stages/${encodeURIComponent(stage)}/decision`, {method:'POST',body}).then(contentResponse),
  /**
   * تغییر دستی وضعیت مرحله از روی نشان وضعیت (دور ۹۰).
   *
   * مسیر جدا از ویرایش عمومی محتواست تا «تأییدشده» و «در انتظار بررسی» هم —
   * که ویرایش عمومی عمداً قفل می‌کند — با مجوز مدیریت جریان محتوا تغییر کنند.
   */
  stageStatus: (id: string, stage: string, status: string, expectedVersion?: string) => request<ApiResponse<Content>>(`/contents/${id}/stages/${encodeURIComponent(stage)}/status`, { method: 'POST', body: { status, ...(expectedVersion ? { expectedVersion } : {}) } }).then(contentResponse),
  get: (id: string, signal?: AbortSignal) => request<ApiResponse<Content>>(`/contents/${id}`, { signal }).then(contentResponse),
  /**
   * ثبت انتشار؛ `publishAt` تاریخ/ساعت واقعیِ انتشار است (اختیاری).
   * نبودنش یعنی «همین حالا» با ساعت سازمان — همان رفتار قبلی.
   */
  publish: (id: string, expectedVersion: string, publishAt?: { date?: string; time?: string }) => request<ApiResponse<{ content: Content; tasks: Task[] }>>(`/contents/${id}/publish`, { method: 'POST', body: { expectedVersion, ...(publishAt?.date ? { publishDate: publishAt.date } : {}), ...(publishAt?.time ? { publishTime: publishAt.time } : {}) } }).then(contentPairResponse),
  unpublish: (id: string, expectedVersion: string) => request<ApiResponse<{ content: Content; tasks: Task[] }>>(`/contents/${id}/unpublish`, { method: 'POST', body: { expectedVersion } }).then(contentPairResponse),
  schedule: (id: string, body: PublicationSettings) => request<ApiResponse<Content> & { meta?: { shiftedOccurrences?: number; shiftedDays?: number } }>(`/contents/${id}/publication-settings`, { method: 'PUT', body }).then(response => ({ ...response, data: normalizeContent(response.data) })),
  createPublicationTask: (id: string, body: PublicationTaskInput) => request<ApiResponse<Task>>(`/contents/${id}/publication-task`, { method: 'POST', body }),
  watch: (id: string) => request<ApiResponse<{contentId:string;watching:boolean}>>(`/contents/${id}/watch`, { method: 'POST' }),
  unwatch: (id: string) => request<ApiResponse<{contentId:string;watching:boolean}>>(`/contents/${id}/watch`, { method: 'DELETE' }),
  list() {
    return request<ApiCollection<Content>>('/contents?per_page=100')
      .then(response => ({ ...response, data: normalizeContents(response.data) }));
  },
  create(payload: Content) {
    return request<ApiResponse<Content>>('/contents', { method: 'POST', body: payload }).then(contentResponse);
  },
  update(id: string, payload: Partial<Content>) {
    return request<ApiResponse<Content>>(`/contents/${id}`, { method: 'PATCH', body: payload }).then(contentResponse);
  },
  /** آرشیو (پیش‌فرض حذف): تاریخچه، نسبت‌های DAM و تسک‌ها حفظ می‌شوند. */
  remove(id: string) {
    return request<void>(`/contents/${id}`, { method: 'DELETE' });
  },
  /** بازگرداندن محتوای آرشیوشده به آخرین وضعیت معتبر؛ idempotent است. */
  restore(id: string) {
    return request<ApiResponse<Content>>(`/contents/${id}/restore`, { method: 'POST' }).then(contentResponse);
  },
  /** حذف نهایی: فقط برای مدیران دارای مجوز content.force_delete. */
  forceRemove(id: string) {
    return request<void>(`/contents/${id}/force`, { method: 'DELETE' });
  },
};
