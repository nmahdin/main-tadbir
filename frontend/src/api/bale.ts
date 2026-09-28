import { ApiResponse, request } from './client';

export interface BaleState {
  enabled: boolean;
  has_token: boolean;
  connection_status: 'connected' | 'failed' | 'untested' | 'not_configured';
  bot_username: string | null;
  last_test_at: string | null;
  last_test_error: string | null;
  remote_webhook_present: boolean;
  webhook_supported: boolean;
  transport: 'short_polling' | 'webhook';
  webhook_status: 'not_configured' | 'unconfirmed' | 'registered' | 'mismatch';
  remote_webhook_matches: boolean;
  last_webhook_at: string | null;
  last_update_id: number | null;
  last_received_via: string | null;
  webhook_url: string | null;
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
export interface ReminderPreview { version: string; text: string; recipients: number }
export interface ReminderResult { run_id: number; recipients: number; skipped: number; counts: Record<string, number> }
export interface BaleAccount {
  transport: 'short_polling' | 'webhook';
  notifications_enabled: boolean;
  connected: boolean;
  linked_at: string | null;
  bot_ready: boolean;
  bot_username: string | null;
}
export const baleApi = {
  preferences: (enabled: boolean) => request('/bale/account/preferences', { method: 'PUT', body: { notifications_enabled: enabled } }),
  deliver: () => request<ApiResponse<{ sent: number }>>('/bale/deliver', { method: 'POST' }),
  reminderPreview: (id: string) => request<ApiResponse<ReminderPreview>>(`/bale/meetings/${id}/reminder`),
  remind: (id: string, requestId: string, version: string) => request<ApiResponse<ReminderResult>>(`/bale/meetings/${id}/reminder`, { method: 'POST', body: { confirm: true, request_id: requestId, version } }),
  deliverReminder: (id: string, run: number) => request<ApiResponse<ReminderResult>>(`/bale/meetings/${id}/reminder/${run}/deliver`, { method: 'POST' }),
  assetTables: () => request<ApiResponse<{ id: number; name: string }[]>>('/bale/asset-tables'),
  tableTeams: (id: string) => request<ApiResponse<{ team_ids: number[]; teams: { id: number; name: string }[] }>>(`/bale/asset-tables/${id}/teams`),
  saveTableTeams: (id: string, team_ids: number[]) => request(`/bale/asset-tables/${id}/teams`, { method: 'PUT', body: { team_ids } }),
  settings: () => request<ApiResponse<BaleState>>('/bale/settings'),
  save: (enabled: boolean, token?: string) => request<ApiResponse<BaleState>>('/bale/settings', { method: 'PUT', body: { enabled, ...(token ? { token } : {}) } }),
  test: () => request<ApiResponse<BaleState>>('/bale/settings/test', { method: 'POST' }),
  webhook: (rotate = false) => request<ApiResponse<BaleState>>('/bale/settings/webhook', { method: 'POST', body: { confirm: true, acknowledge_secret_url: true, rotate } }),
  polling: () => request<ApiResponse<BaleState>>('/bale/settings/polling', { method: 'POST', body: { confirm: true } }),
  remove: () => request<ApiResponse<BaleState>>('/bale/settings', { method: 'DELETE', body: { confirm: true } }),
  removeLocal: () => request<ApiResponse<BaleState>>('/bale/settings', { method: 'DELETE', body: { confirm: true, local_only: true } }),
  process: () => request<ApiResponse<BaleState>>('/bale/process', { method: 'POST' }),
  account: () => request<ApiResponse<BaleAccount>>('/bale/account'),
  code: () => request<ApiResponse<{ code: string; expires_at: string }>>('/bale/account/code', { method: 'POST' }),
  unlink: () => request<ApiResponse<BaleAccount>>('/bale/account', { method: 'DELETE', body: { confirm: true } }),
};
