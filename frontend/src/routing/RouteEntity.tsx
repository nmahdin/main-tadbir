import { rememberServerRecords } from '../queries/serverSnapshots';
import React, { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { resolveRoute, viewPermissions } from './routes';
import { useApp } from '../context/AppContext';
import { projectsApi, tasksApi, contentsApi } from '../api';
import { workspaceKey } from '../queries/queryClient';
import { ErrorState, LoadingState } from '../components/common/Primitives';
import { runtime } from '../config/runtime';
export function RouteEntity({ children }: { children: React.ReactNode }) {
  const location = useLocation(); const route = resolveRoute(location.pathname, runtime.demoMode);
  const { currentUser } = useAuth(); const { hasPermission } = useApp(); const client = useQueryClient();
  const permission = viewPermissions[route.view]; const allowed = !permission || permission.some(hasPermission);
  const entity = useQuery<any>({ queryKey: ['entity', currentUser.id, route.module, route.id],
    enabled: !!route.module && allowed && !runtime.demoMode,
    queryFn: async () => (await ({ projects: projectsApi, tasks: tasksApi, contents: contentsApi }[route.module!].get(route.id!))).data,
  });
  const collection = useQuery<any[]>({ queryKey: workspaceKey(currentUser.id, route.module ?? 'route-none'), enabled: false });
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
