import { SessionChangedError } from '../api/errors';
import { rememberServerRecords, snapshotSession } from './serverSnapshots';
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: false,
    retry: (attempt, error: any) => attempt < 1 && (!error?.status || error.status >= 500) },
  mutations: { retry: false },
} });
export const workspaceKey = (userId: string, name: string) => ['workspace', userId, name] as const;
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
