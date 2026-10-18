import { rememberServerRecords } from '../../shared/queries/serverSnapshots';
import React, { useEffect, useRef } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthContext';
import { useLocation } from 'react-router-dom';
import { resolveRoute, viewPermissions } from './routes';
import { useApp } from '../providers/AppContext';
import { projectsApi, tasksApi, contentsApi } from '../../shared/api';
import { workspaceKey } from '../../shared/queries/queryClient';
import { ErrorState, LoadingState } from '../../shared/ui/Primitives';
import { runtime } from '../../shared/config/runtime';
export function RouteEntity({ children }: { children: React.ReactNode }) {
  const location = useLocation(); const route = resolveRoute(location.pathname, runtime.demoMode);
  const { currentUser } = useAuth(); const { hasPermission } = useApp(); const client = useQueryClient();
  const permission = viewPermissions[route.view]; const allowed = !permission || permission.some(hasPermission);
  const entity = useQuery<any>({ queryKey: ['entity', currentUser.id, route.module, route.id],
    enabled: !!route.module && allowed && !runtime.demoMode,
    queryFn: async () => (await ({ projects: projectsApi, tasks: tasksApi, contents: contentsApi }[route.module!].get(route.id!))).data,
  });
  // Cache-only peek used to avoid duplicating the fetched entity in
  // the collection cache. skipToken marks "never fetch" explicitly;
  // a bare enabled:false query without queryFn logs missing-queryFn
  // errors on every render in development.
  const collection = useQuery<any[]>({ queryKey: workspaceKey(currentUser.id, route.module ?? 'route-none'), queryFn: skipToken, enabled: false });
  const synchronized = useRef(0);
  useEffect(() => {
    if (!route.module || !entity.data) return;
    if (synchronized.current === entity.dataUpdatedAt && collection.data?.some(row => row.id === entity.data.id)) return;
    synchronized.current = entity.dataUpdatedAt;
    rememberServerRecords(currentUser.id, route.module, [entity.data]);
    client.setQueryData<any[]>(workspaceKey(currentUser.id, route.module), old => [entity.data, ...(old ?? []).filter(row => row.id !== entity.data.id)]);
  }, [entity.data, entity.dataUpdatedAt, collection.data, route.module, currentUser.id, client]);
  if (!route.known) return <ErrorState title="۴۰۴ — صفحهٔ مورد نظر پیدا نشد." />;
  if (!allowed) return <ErrorState title="شما مجوز مشاهدهٔ این صفحه را ندارید." />;
  if (route.module && !runtime.demoMode) {
    if (entity.isPending) return <LoadingState />;
    if (entity.isError) return <ErrorState error={entity.error} onRetry={() => void entity.refetch()} />;
  }
  return <>{children}</>;
}
