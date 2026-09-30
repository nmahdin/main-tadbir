import { ApiCollection, ApiResponse, request } from './client';

export type CommentSubjectType = 'task' | 'content' | 'idea' | 'asset';

export interface UnifiedComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  text: string;
  timestamp: string;
  createdAt: string;
  replyToId?: string | null;
  assetIds: string[];
  reactions: unknown[];
  subjectType: CommentSubjectType;
  subjectId: string;
  subjectTitle: string;
  subjectUrl?: string | null;
}

export interface CommentListParams {
  page?: number;
  per_page?: number;
  subject_type?: CommentSubjectType | '';
  subject_id?: string;
  user_id?: string;
  search?: string;
}

const queryString = (params?: CommentListParams) => {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return query.size ? `?${query.toString()}` : '';
};

export const commentsApi = {
  list(params?: CommentListParams) {
    return request<ApiCollection<UnifiedComment>>(`/comments${queryString(params)}`);
  },
  create(payload: { subjectType: CommentSubjectType; subjectId: string; text: string; replyToId?: string; assetIds?: string[] }) {
    return request<ApiResponse<UnifiedComment>>('/comments', { method: 'POST', body: payload });
  },
  remove(id: string) {
    return request<void>(`/comments/${id}`, { method: 'DELETE' });
  },
};
