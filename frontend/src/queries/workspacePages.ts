import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { request, type ApiCollection } from '../api/client';
import { runtime } from '../config/runtime';
import { canUsePermission } from '../utils/permissions';
import { workspaceKey } from './queryClient';

export type WorkspaceModule = 'projects' | 'tasks' | 'contents' | 'notifications' | 'approvals';
export type PageResult<T = any> = ApiCollection<T> & { meta?: NonNullable<ApiCollection<T>['meta']> & { unread_count?: number; types?: string[] } };
export const modulePermission = { projects: 'projects.view', tasks: 'tasks.view', contents: 'content.view', notifications: '', approvals: 'content.approve' };
export function useWorkspacePage<T = any>(module: WorkspaceModule, params: Record<string, string | number>, enabled = true) {
  const { currentUser, isLoggedIn } = useAuth();
  const allowed = !modulePermission[module] || canUsePermission(currentUser, [], modulePermission[module]);
  return useQuery<PageResult<T>>({ queryKey: ['pages', currentUser.id, module, params],
    queryFn: ({ signal }) => request(`/${module}?${new URLSearchParams(Object.entries(params).map(([k,v]) => [k, String(v)]))}`, { signal }),
    enabled: enabled && allowed && isLoggedIn && !runtime.demoMode, placeholderData: keepPreviousData,
    refetchInterval: module === 'notifications' ? 60_000 : false, refetchOnWindowFocus: module === 'notifications',
  });
}
export function useNotificationRead() {
  const client = useQueryClient(); const { currentUser } = useAuth();
  return useMutation({ mutationFn: (id: string | null) => request(id ? `/notifications/${id}` : '/notifications/read-all', { method: id ? 'PUT' : 'POST', body: id ? { read: true } : undefined }),
    onSuccess: async () => { await Promise.all([
      client.invalidateQueries({ queryKey: ['pages', currentUser.id, 'notifications'] }),
      client.invalidateQueries({ queryKey: workspaceKey(currentUser.id, 'notifications') }),
    ]); },
  });
}
