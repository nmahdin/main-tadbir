import { ApiResponse, request } from './client';

export interface BaleState {
  enabled: boolean;
  has_token: boolean;
  connection_status: 'connected' | 'failed' | 'untested' | 'not_configured';
  bot_username: string | null;
  last_test_at: string | null;
  last_test_error: string | null;
  remote_webhook_present: boolean;
  runner_configured: boolean;
  runner_recent: boolean;
  last_external_tick_at: string | null;
  last_tick_at: string | null;
  last_received_at: string | null;
  last_sent_at: string | null;
  last_error: string | null;
  linked_users: number;
  outbox_counts: Record<string, number>;
  recent_errors: { id: number; status: string; error_code: string; updated_at: string }[];
}
export interface BaleAccount {
  connected: boolean;
  linked_at: string | null;
  bot_ready: boolean;
  bot_username: string | null;
}
export const baleApi = {
  settings: () => request<ApiResponse<BaleState>>('/bale/settings'),
  save: (enabled: boolean, token?: string) => request<ApiResponse<BaleState>>('/bale/settings', { method: 'PUT', body: { enabled, ...(token ? { token } : {}) } }),
  test: () => request<ApiResponse<BaleState>>('/bale/settings/test', { method: 'POST' }),
  polling: () => request<ApiResponse<BaleState>>('/bale/settings/polling', { method: 'POST', body: { confirm: true } }),
  remove: () => request<ApiResponse<BaleState>>('/bale/settings', { method: 'DELETE', body: { confirm: true } }),
  removeLocal: () => request<ApiResponse<BaleState>>('/bale/settings', { method: 'DELETE', body: { confirm: true, local_only: true } }),
  process: () => request<ApiResponse<BaleState>>('/bale/process', { method: 'POST' }),
  account: () => request<ApiResponse<BaleAccount>>('/bale/account'),
  code: () => request<ApiResponse<{ code: string; expires_at: string }>>('/bale/account/code', { method: 'POST' }),
  unlink: () => request<ApiResponse<BaleAccount>>('/bale/account', { method: 'DELETE', body: { confirm: true } }),
};
