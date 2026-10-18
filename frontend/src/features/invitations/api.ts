import { request, type ApiResponse } from '../../api/client';

/**
 * Stage C6-4 client for the Stage C6-3 invitation APIs.
 * Tokens travel only in POST bodies; nothing here persists or
 * logs them.
 */

export interface InvitationPresentation {
  invitation: {
    type: 'organization' | 'workspace' | 'combined' | string;
    status: string;
    expires_at: string;
    will_create_organization_membership: boolean;
  };
  organization: { name: string; description: string | null; logo_url: string | null } | null;
  workspace: { name: string; description: string | null } | null;
  inviter: { name: string } | null;
  intended_organization_role: { name: string; scope: string; summary: string } | null;
  intended_workspace_role: { name: string; scope: string; summary: string } | null;
  message: string | null;
}

export interface MinimalInvitationStatus {
  invitation: { status: string };
}

export interface AcceptanceResult {
  invitation_id: number;
  type: string;
  organization_id: number | null;
  workspace_id: number | null;
  created_organization_membership: boolean;
  created_workspace_membership: boolean;
  preserved_existing_organization_role: boolean;
  preserved_existing_workspace_role: boolean;
  navigation_target: { type: 'organization' | 'workspace'; id: number } | null;
}

export interface EmailVerificationState {
  email: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
}

export interface AdminInvitation {
  id: number;
  type: string;
  email: string;
  organization_id: number | null;
  workspace_id: number | null;
  intended_organization_role_id: number | null;
  intended_workspace_role_id: number | null;
  message: string | null;
  status: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
}

export interface IssuedInvitationResponse {
  invitation: AdminInvitation;
  invitation_token: string;
  accept_url: string;
  email_delivery_status: 'sent' | 'failed' | string;
}

export interface ScopedRoleOption {
  id: number;
  key: string;
  name: string;
  scope: string;
}

export const invitationsApi = {
  preview(token: string) {
    return request<ApiResponse<InvitationPresentation | MinimalInvitationStatus>>('/invitations/preview', {
      method: 'POST',
      cache: 'no-store',
      body: { token },
    });
  },

  accept(token: string) {
    return request<ApiResponse<AcceptanceResult>>('/invitations/accept', {
      method: 'POST',
      cache: 'no-store',
      body: { token },
    });
  },

  emailVerification() {
    return request<ApiResponse<EmailVerificationState>>('/auth/email/verification', { cache: 'no-store' });
  },

  requestEmailVerification(email: string) {
    return request<ApiResponse<{ email: string; expires_at: string; delivery: string }>>('/auth/email/verification/request', {
      method: 'POST',
      cache: 'no-store',
      body: { email },
    });
  },

  confirmEmailVerification(token: string) {
    return request<ApiResponse<EmailVerificationState>>('/auth/email/verification/confirm', {
      method: 'POST',
      cache: 'no-store',
      body: { token },
    });
  },

  listOrganizationInvitations(organizationId: number) {
    return request<ApiResponse<AdminInvitation[]>>(`/core/organizations/${organizationId}/invitations`, { cache: 'no-store' });
  },

  listWorkspaceInvitations(workspaceId: number) {
    return request<ApiResponse<AdminInvitation[]>>(`/core/workspaces/${workspaceId}/invitations`, { cache: 'no-store' });
  },

  createOrganizationInvitation(organizationId: number, payload: { email: string; organization_role_id: number; message?: string }) {
    return request<ApiResponse<IssuedInvitationResponse>>(`/core/organizations/${organizationId}/invitations`, {
      method: 'POST',
      cache: 'no-store',
      body: payload,
    });
  },

  createWorkspaceInvitation(workspaceId: number, payload: { email: string; workspace_role_id: number; message?: string }) {
    return request<ApiResponse<IssuedInvitationResponse>>(`/core/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      cache: 'no-store',
      body: payload,
    });
  },

  createCombinedInvitation(workspaceId: number, payload: { email: string; organization_role_id: number; workspace_role_id: number; message?: string }) {
    return request<ApiResponse<IssuedInvitationResponse>>(`/core/workspaces/${workspaceId}/combined-invitations`, {
      method: 'POST',
      cache: 'no-store',
      body: payload,
    });
  },

  revokeInvitation(invitationId: number) {
    return request<ApiResponse<AdminInvitation>>(`/core/invitations/${invitationId}/revoke`, {
      method: 'POST',
      cache: 'no-store',
      body: {},
    });
  },

  organizationRoles(organizationId: number) {
    return request<ApiResponse<ScopedRoleOption[]>>(`/core/organizations/${organizationId}/roles`, { cache: 'no-store' });
  },

  workspaceRoles(workspaceId: number) {
    return request<ApiResponse<ScopedRoleOption[]>>(`/core/workspaces/${workspaceId}/roles`, { cache: 'no-store' });
  },
};
