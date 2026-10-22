import { request, type ApiResponse } from '../../shared/api/client';

/**
 * Stage C7-4 client for the scoped-settings APIs.
 *
 * Scope always comes from an explicit organization/workspace id
 * chosen from the caller's own memberships (server re-verifies);
 * preferences are always the authenticated actor's own. Secret
 * values travel exactly once (the PUT body) and are never read
 * back — responses contain configured metadata only.
 */

export type SettingSource = 'default' | 'organization' | 'workspace' | 'user';

export interface SettingDefinitionPayload {
  key: string;
  title: string;
  description: string | null;
  type: string;
  default: unknown;
  allowed_scopes: string[];
  inheritance: string;
  workspace_override: boolean;
  user_override: boolean;
  nullable: boolean;
  sensitivity: string;
  owner: string;
  values: string[] | null;
}

export interface EffectivePayload {
  value: unknown;
  source: SettingSource;
  source_owner_type: string | null;
  source_owner_id: number | null;
  legacy: boolean;
  has_explicit_value: boolean;
}

export interface ExplicitPayload {
  exists: boolean;
  value: unknown;
  version: number | null;
}

export interface OverridePolicyPayload {
  allow: boolean;
  version: number | null;
  explicit: boolean;
}

export interface ScopedSettingItem {
  definition: SettingDefinitionPayload;
  effective: EffectivePayload;
  explicit: ExplicitPayload;
  override_policy: OverridePolicyPayload | null;
}

export interface SecretMetadata {
  configured: boolean;
  version: number | null;
  updated_at: string | null;
}

export interface ScopedSecretItem {
  definition: SettingDefinitionPayload;
  secret: SecretMetadata;
}

export interface SettingRevision {
  id: number;
  operation: string;
  version: number;
  previous_present: boolean;
  previous_value: unknown;
  new_present: boolean;
  new_value: unknown;
  actor_user_id: number | null;
  created_at: string | null;
}

export interface HistoryPage {
  data: SettingRevision[];
  meta: { page: number; per_page: number; total: number; last_page: number };
}

export interface ScopeSummary {
  id: number;
  name: string;
  organization_id?: number | null;
}

const orgBase = (organizationId: number) => `/core/organizations/${organizationId}`;
const wsBase = (workspaceId: number) => `/core/workspaces/${workspaceId}`;

export const scopedSettingsApi = {
  organizations() {
    return request<ApiResponse<ScopeSummary[]>>('/core/organizations');
  },
  workspaces() {
    return request<ApiResponse<ScopeSummary[]>>('/core/workspaces');
  },

  organizationSettings(organizationId: number) {
    return request<ApiResponse<ScopedSettingItem[]>>(`${orgBase(organizationId)}/settings`);
  },
  writeOrganizationSetting(organizationId: number, key: string, value: unknown, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload; effective: EffectivePayload }>>(
      `${orgBase(organizationId)}/settings/${key}`,
      { method: 'PUT', body: { value, expected_version: expectedVersion ?? undefined } },
    );
  },
  removeOrganizationSetting(organizationId: number, key: string, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload; effective: EffectivePayload }>>(
      `${orgBase(organizationId)}/settings/${key}`,
      { method: 'DELETE', body: { expected_version: expectedVersion ?? undefined } },
    );
  },
  setOrganizationPolicy(organizationId: number, key: string, allow: boolean, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; override_policy: OverridePolicyPayload }>>(
      `${orgBase(organizationId)}/settings/${key}/policy`,
      { method: 'PUT', body: { allow, expected_version: expectedVersion ?? undefined } },
    );
  },

  workspaceSettings(workspaceId: number) {
    return request<ApiResponse<ScopedSettingItem[]>>(`${wsBase(workspaceId)}/settings`);
  },
  writeWorkspaceSetting(workspaceId: number, key: string, value: unknown, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload; effective: EffectivePayload }>>(
      `${wsBase(workspaceId)}/settings/${key}`,
      { method: 'PUT', body: { value, expected_version: expectedVersion ?? undefined } },
    );
  },
  removeWorkspaceSetting(workspaceId: number, key: string, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload; effective: EffectivePayload }>>(
      `${wsBase(workspaceId)}/settings/${key}`,
      { method: 'DELETE', body: { expected_version: expectedVersion ?? undefined } },
    );
  },

  preferences() {
    return request<ApiResponse<ScopedSettingItem[]>>('/core/preferences');
  },
  writePreference(key: string, value: unknown, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload; effective: EffectivePayload }>>(
      `/core/preferences/${key}`,
      { method: 'PUT', body: { value, expected_version: expectedVersion ?? undefined } },
    );
  },
  removePreference(key: string, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload; effective: EffectivePayload }>>(
      `/core/preferences/${key}`,
      { method: 'DELETE', body: { expected_version: expectedVersion ?? undefined } },
    );
  },

  organizationSecrets(organizationId: number) {
    return request<ApiResponse<ScopedSecretItem[]>>(`${orgBase(organizationId)}/secrets`);
  },
  putOrganizationSecret(organizationId: number, key: string, value: string, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; secret: SecretMetadata }>>(
      `${orgBase(organizationId)}/secrets/${key}`,
      { method: 'PUT', body: { value, expected_version: expectedVersion ?? undefined } },
    );
  },
  revokeOrganizationSecret(organizationId: number, key: string, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; secret: SecretMetadata }>>(
      `${orgBase(organizationId)}/secrets/${key}`,
      { method: 'DELETE', body: { expected_version: expectedVersion ?? undefined } },
    );
  },
  workspaceSecrets(workspaceId: number) {
    return request<ApiResponse<ScopedSecretItem[]>>(`${wsBase(workspaceId)}/secrets`);
  },
  putWorkspaceSecret(workspaceId: number, key: string, value: string, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; secret: SecretMetadata }>>(
      `${wsBase(workspaceId)}/secrets/${key}`,
      { method: 'PUT', body: { value, expected_version: expectedVersion ?? undefined } },
    );
  },
  revokeWorkspaceSecret(workspaceId: number, key: string, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; secret: SecretMetadata }>>(
      `${wsBase(workspaceId)}/secrets/${key}`,
      { method: 'DELETE', body: { expected_version: expectedVersion ?? undefined } },
    );
  },

  organizationHistory(organizationId: number, key: string, page = 1) {
    return request<HistoryPage>(`${orgBase(organizationId)}/settings/${key}/history?page=${page}&per_page=10`);
  },
  workspaceHistory(workspaceId: number, key: string, page = 1) {
    return request<HistoryPage>(`${wsBase(workspaceId)}/settings/${key}/history?page=${page}&per_page=10`);
  },
  preferenceHistory(key: string, page = 1) {
    return request<HistoryPage>(`/core/preferences/${key}/history?page=${page}&per_page=10`);
  },
  restoreOrganizationSetting(organizationId: number, key: string, revisionId: number, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload }>>(
      `${orgBase(organizationId)}/settings/${key}/history/${revisionId}/restore`,
      { method: 'POST', body: { expected_version: expectedVersion ?? undefined } },
    );
  },
  restoreWorkspaceSetting(workspaceId: number, key: string, revisionId: number, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload }>>(
      `${wsBase(workspaceId)}/settings/${key}/history/${revisionId}/restore`,
      { method: 'POST', body: { expected_version: expectedVersion ?? undefined } },
    );
  },
  restorePreference(key: string, revisionId: number, expectedVersion?: number | null) {
    return request<ApiResponse<{ key: string; explicit: ExplicitPayload }>>(
      `/core/preferences/${key}/history/${revisionId}/restore`,
      { method: 'POST', body: { expected_version: expectedVersion ?? undefined } },
    );
  },
};
