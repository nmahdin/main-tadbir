import { SessionChangedError } from '../api/errors';
import { rememberServerRecords, snapshotSession } from './serverSnapshots';
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: false,
    retry: (attempt, error: any) => attempt < 1 && (!error?.status || error.status >= 500) },
  mutations: { retry: false },
} });
export const workspaceKey = (userId: string, name: string) => ['workspace', userId, name] as const;

/** Invalidate every cached representation of affected modules in one batched scan. */
export function invalidateWorkspaceModules(userId: string, modules: Iterable<string>) {
  const affected = new Set(modules);
  const changesSearch = ['projects', 'tasks', 'contents'].some(module => affected.has(module));
  const changesAnalytics = [
    'projects', 'tasks', 'contents', 'ideas', 'think-tank-ideas',
    'secretariat', 'secretariat-letters', 'users', 'departments',
  ].some(module => affected.has(module));
  return queryClient.invalidateQueries({
    predicate: query => {
      const [scope, owner, module] = query.queryKey;
      if (owner !== userId) return false;
      if (scope === 'global-search') return changesSearch;
      if (scope === 'analytics') return changesAnalytics;
      return typeof module === 'string'
        && affected.has(module)
        && ['pages', 'entity', 'preview', 'workspace'].includes(String(scope));
    },
  });
}

export async function fetchWorkspace<T>(userId: string, name: string, load: () => Promise<{ data: T }>) {
  const session = snapshotSession();
  if (session.userId !== userId) throw new SessionChangedError();
  const data = await queryClient.fetchQuery({ queryKey: workspaceKey(userId, name), queryFn: async () => {
    const result = await load();
    if (session !== snapshotSession()) throw new SessionChangedError();
    rememberServerRecords(userId, name, result.data);
    return result.data;
  } });
  if (session !== snapshotSession()) throw new SessionChangedError();
  return { data };
}
