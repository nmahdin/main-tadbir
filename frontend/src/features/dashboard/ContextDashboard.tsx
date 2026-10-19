import React from 'react';
import { useEnvironment } from '../../app/providers/EnvironmentContext';
import { LoadingState } from '../../shared/ui/Primitives';
import { OrganizationDashboard } from './OrganizationDashboard';
import { PlatformDashboard } from './PlatformDashboard';
import { WorkspaceDashboard } from './WorkspaceDashboard';

/**
 * UX-02-2: /dashboard resolves by the UX-02-1 environment context.
 * Platform and organization selections get management dashboards;
 * every workspace selection (personal, organizational, or the
 * legacy unpinned shell) gets the shared workspace dashboard.
 */
export function ContextDashboard() {
  const { current, isLoading } = useEnvironment();

  if (!current) {
    return isLoading
      ? <div className="p-8"><LoadingState label="در حال آماده‌سازی داشبورد…" /></div>
      : <WorkspaceDashboard />;
  }

  if (current.kind === 'platform') return <PlatformDashboard />;
  if (current.kind === 'organization' && current.id !== null) return <OrganizationDashboard organizationId={current.id} />;
  return <WorkspaceDashboard />;
}
