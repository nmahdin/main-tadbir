import { ApiResponse, request } from './client';

export interface GoogleWorkspaceLink {
  id: number;
  resource_type: 'document' | 'spreadsheet';
  name: string;
  mime_type: string;
  web_url: string;
  remote_modified_at?: string | null;
  last_pushed_at?: string | null;
  last_pulled_at?: string | null;
  last_synced_at?: string | null;
}

type LinkResponse = ApiResponse<{ link: GoogleWorkspaceLink | null }>;

const operations = (base: string) => ({
  status: () => request<LinkResponse>(base),
  push: (force = false) => request<LinkResponse>(`${base}/push`, { method: 'POST', body: { force } }),
  pull: (force = false) => request<ApiResponse<{ link: GoogleWorkspaceLink; asset?: unknown; summary?: { created: number; updated: number; deleted: number } }>>(`${base}/pull`, { method: 'POST', body: { force } }),
  disconnect: () => request<void>(base, { method: 'DELETE' }),
});

export const googleWorkspaceApi = {
  asset: (assetId: number | string) => operations(`/dam/library/${assetId}/google-workspace`),
  table: (tableId: number | string) => operations(`/dam/data-tables/${tableId}/google-workspace`),
};
