import { request, type ApiResponse } from '../../shared/api/client';

/**
 * UX-02-2 clients for the read-only dashboard summary endpoints.
 * Every section is permission-gated server-side; a null section
 * means "not permitted" and must render as an honest unavailable
 * state — never as a zero.
 */

export interface DashboardActivityItem {
  id: number;
  action: string;
  actor_name: string | null;
  target_type: string | null;
  target_id: number | null;
  created_at: string | null;
}

export interface PlatformDashboardSummary {
  organizations: { total: number; active: number; suspended: number; without_subscription: number } | null;
  users: { total: number } | null;
  subscriptions: {
    total: number;
    active: number;
    grace: number;
    expired: number;
    not_started: number;
    expiring_within_30_days: number;
  } | null;
  recent_activity: DashboardActivityItem[] | null;
}

export interface SubscriptionLimit {
  resource_key: string;
  limit_value: number | null;
  is_unlimited: boolean;
  usage: number | null;
}

export interface OrganizationDashboardSummary {
  pending_free_activation?: boolean;
  members: { active: number } | null;
  workspaces: { total: number } | null;
  subscription: {
    state: string;
    plan: { key: string; version: number } | null;
    starts_at: string | null;
    expires_at: string | null;
    grace_ends_at: string | null;
    limits: SubscriptionLimit[];
  } | null;
  invitations: {
    pending: number;
    recent: { id: number; email: string; state: string; created_at: string | null }[];
  } | null;
  recent_activity: DashboardActivityItem[] | null;
}

export interface PersonalDashboardSummary {
  subscription: OrganizationDashboardSummary['subscription'];
  pending_free_activation: boolean;
}

export const dashboardApi = {
  personalSummary() {
    return request<ApiResponse<PersonalDashboardSummary>>('/core/personal/dashboard-summary');
  },
  platformSummary() {
    return request<ApiResponse<PlatformDashboardSummary>>('/core/platform/dashboard-summary');
  },
  organizationSummary(organizationId: number) {
    return request<ApiResponse<OrganizationDashboardSummary>>(`/core/organizations/${organizationId}/dashboard-summary`);
  },
};
