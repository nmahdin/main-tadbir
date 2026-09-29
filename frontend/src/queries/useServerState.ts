import { runtime } from '../config/runtime';
import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { workspaceKey } from './queryClient';
/** Compatibility adapter: existing operations update Query's cache, not another copy in AppContext.
 * Fetching still enters through loadWorkspace while individual views migrate to the query hooks.
 */
export function useServerState<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  initial = useRef(initial).current;
  const { currentUser } = useAuth();
  const client = useQueryClient();
  const key = workspaceKey(currentUser.id, name);
  const query = useQuery<T>({ queryKey: key, enabled: false, initialData: runtime.demoMode ? initial : undefined });
  const set = useCallback<Dispatch<SetStateAction<T>>>(update => {
    client.setQueryData<T>(workspaceKey(currentUser.id, name), previous =>
      typeof update === 'function' ? (update as (value: T) => T)(previous ?? initial) : update);
    void client.invalidateQueries({ queryKey: ['entity', currentUser.id, name] });
  }, [client, currentUser.id, name]);
  return [query.data ?? initial, set];
}
