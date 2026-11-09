import { runtime } from '../config/runtime';
import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/providers/AuthContext';
import { workspaceKey } from './queryClient';
/** Compatibility adapter: existing operations update Query's cache, not another copy in AppContext.
 * Fetching still enters through loadWorkspace while individual views migrate to the query hooks.
 */
export function useServerState<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  initial = useRef(initial).current;
  const { currentUser } = useAuth();
  const client = useQueryClient();
  const key = workspaceKey(currentUser.id, name);
  // Cache-only adapter: data enters via fetchWorkspace (which supplies
  // its own queryFn) or setQueryData — never via this hook. skipToken
  // is React Query's explicit "no fetch" marker; without it every
  // render logs a missing-queryFn error even though fetching is
  // disabled, and an invalidation could enter a fetch path with no
  // function to run. It fabricates no data: reads stay cache reads.
  const query = useQuery<T>({ queryKey: key, queryFn: skipToken, enabled: false, initialData: runtime.demoMode ? initial : undefined });
  const set = useCallback<Dispatch<SetStateAction<T>>>(update => {
    client.setQueryData<T>(workspaceKey(currentUser.id, name), previous =>
      typeof update === 'function' ? (update as (value: T) => T)(previous ?? initial) : update);
    void client.invalidateQueries({ queryKey: ['entity', currentUser.id, name] });
  }, [client, currentUser.id, name]);
  return [query.data ?? initial, set];
}
