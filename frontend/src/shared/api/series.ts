import { ApiCollection, ApiResponse, request } from './client';
import type {
  Content,
  ContentSeries,
  SeriesActivity,
  SeriesIntegrity,
  SeriesPeriodPreview,
  SeriesRevision,
  SeriesSummary,
} from '../types';

const qs = (params: Record<string, unknown> = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.size ? `?${query}` : '';
};

export type SeriesInput = {
  name: string;
  description?: string;
  codePrefix: string;
  contentType: string;
  projectId?: string | null;
  departmentId?: string | null;
  ownerId?: string | null;
  processTemplateId?: string | null;
  recurrenceType: 'weekly' | 'monthly' | 'project_based' | 'manual';
  recurrenceConfig?: {
    startDate?: string;
    endDate?: string;
    occurrenceLimit?: number;
    interval?: number;
    deadlineOffsetDays?: number;
    calendar?: 'jalali' | 'gregorian';
    dayOfMonth?: number;
    activationTime?: string;
  };
  defaultContentPayload?: Partial<Content>;
  defaultPublicationConfig?: Record<string, unknown>;
  applyTemplate?: boolean;
  changeReason?: string;
  lockVersion?: number;
};

export type NextOccurrenceInput = {
  periodKey: string;
  requestKey: string;
  lockVersion: number;
  startDate?: string;
  deadline?: string;
  title?: string;
  processTemplateId?: string | null;
  stageAssignments?: Array<{ stageKey: string; assigneeId?: string | null; reviewerId?: string | null }>;
  publicationDate?: string;
  publicationTime?: string;
  caption?: string;
};

export const seriesApi = {
  list: (params: Record<string, unknown> = {}) =>
    request<ApiCollection<ContentSeries>>(`/content-series${qs(params)}`),
  workspaceSummary: () => request<ApiResponse<SeriesSummary>>('/content-series-summary'),
  get: (id: string) => request<ApiResponse<ContentSeries>>(`/content-series/${id}`),
  create: (body: SeriesInput) => request<ApiResponse<ContentSeries>>('/content-series', { method: 'POST', body }),
  update: (id: string, body: SeriesInput) => request<ApiResponse<ContentSeries>>(`/content-series/${id}`, { method: 'PATCH', body }),
  archiveLegacy: (id: string) => request<ApiResponse<ContentSeries>>(`/content-series/${id}`, { method: 'DELETE' }),
  transition: (id: string, command: 'pause' | 'resume' | 'archive' | 'restore', lockVersion: number, reason?: string) =>
    request<ApiResponse<ContentSeries>>(`/content-series/${id}/commands/${command}`, {
      method: 'POST', body: { lockVersion, reason },
    }),
  preview: (id: string) => request<ApiResponse<SeriesPeriodPreview>>(`/content-series/${id}/next-preview`),
  schedule: (id: string, count = 6) =>
    request<ApiResponse<SeriesPeriodPreview[]>>(`/content-series/${id}/schedule-preview${qs({ count })}`),
  createNext: (id: string, body: NextOccurrenceInput) =>
    request<ApiResponse<Content>>(`/content-series/${id}/occurrences/next`, { method: 'POST', body }),
  batch: (id: string, count: number, requestKey: string, lockVersion: number) =>
    request<ApiResponse<Content[]>>(`/content-series/${id}/occurrences/batch`, {
      method: 'POST', body: { count, requestKey, lockVersion },
    }),
  occurrences: (id: string, params: Record<string, unknown> = {}) =>
    request<ApiCollection<Content>>(`/content-series/${id}/occurrences${qs(params)}`),
  itemSummary: (id: string) => request<ApiResponse<{
    total: number; published: number; inProgress: number; producing: number;
    waitingReview: number; readyPublish: number; overdue: number; planned: number;
    archived: number; latestCode?: string; next: SeriesPeriodPreview;
  }>>(`/content-series/${id}/summary`),
  revisions: (id: string, page = 1) => request<ApiCollection<SeriesRevision>>(`/content-series/${id}/revisions${qs({ page, per_page: 20 })}`),
  activity: (id: string, page = 1) => request<ApiCollection<SeriesActivity>>(`/content-series/${id}/activity${qs({ page, per_page: 25 })}`),
  integrity: (id: string) => request<ApiResponse<SeriesIntegrity>>(`/content-series/${id}/integrity`),
};
