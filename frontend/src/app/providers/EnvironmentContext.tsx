import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { environmentsApi } from '../../shared/api/environments';
import { runtime } from '../../shared/config/runtime';
import { useOnlineStatus } from '../../shared/lib/useOnlineStatus';
import {
  defaultEnvironment,
  landingPathFor,
  parseRecents,
  parseSelection,
  pushRecent,
  resolveEnvironment,
  sameEnvironment,
  validRecents,
  type EnvironmentDescriptor,
  type EnvironmentSelection,
  type EnvironmentsPayload,
  type RecentEnvironment,
} from '../../shared/lib/environments';

/**
 * UX-02-1 environment context (S2).
 *
 * Holds the selected application environment (platform / organization
 * / workspace) as UI state. It is deliberately NOT an authorization
 * input: the payload comes from GET /core/environments (server-side
 * C1–C3 visibility), the selection is re-validated against every
 * fresh payload, and switching only isolates client caches — every
 * API request keeps authorizing independently on the server (K2).
 *
 * Persistence stores identifiers only, keyed by user id. Names and
 * roles are always read from the fresh payload, never from storage.
 */

const selectionStorageKey = (userId: string) => `tadbir:environment:${userId}`;
const recentsStorageKey = (userId: string) => `tadbir:environment-recents:${userId}`;

function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}

const DEMO_PAYLOAD: EnvironmentsPayload = {
  platform: { eligible: false, is_primary: false, permissions: [] },
  organizations: [],
  workspaces: [{
    id: 0,
    name: 'محیط نمایشی',
    organization_id: null,
    organization_name: null,
    is_default: true,
    relation: 'owner',
    role: { key: 'demo', name: 'محیط نمایشی' },
    permissions: [],
  }],
};

export type SwitchProblem = 'invalid-context' | 'switch-failed';

interface EnvironmentContextValue {
  payload: EnvironmentsPayload | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  selection: EnvironmentSelection | null;
  /** Resolved descriptor for the current selection; null while the
   *  payload loads or when the selection is no longer available. */
  current: EnvironmentDescriptor | null;
  /** True once a fresh payload proves the stored selection cannot
   *  be entered anymore (membership ended, org suspended, …). */
  currentInvalid: boolean;
  switchEnvironment: (next: EnvironmentSelection) => boolean;
  isSwitching: boolean;
  switchProblem: SwitchProblem | null;
  clearSwitchProblem: () => void;
  /** Recent environments, resolved against the fresh payload. */
  recents: EnvironmentDescriptor[];
  resetToDefault: () => void;
  isOnline: boolean;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoggedIn } = useAuth();
  const userId = isLoggedIn ? currentUser.id : '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const environmentsQuery = useQuery({
    queryKey: ['environments', userId],
    queryFn: async () => (await environmentsApi.list()).data,
    enabled: Boolean(userId) && !runtime.demoMode,
    staleTime: 60_000,
    retry: false,
  });

  const payload: EnvironmentsPayload | null = runtime.demoMode
    ? (isLoggedIn ? DEMO_PAYLOAD : null)
    : (environmentsQuery.data ?? null);

  const [selection, setSelection] = useState<EnvironmentSelection | null>(null);
  const [recents, setRecents] = useState<RecentEnvironment[]>([]);
  const [isSwitching, setSwitching] = useState(false);
  const [switchProblem, setSwitchProblem] = useState<SwitchProblem | null>(null);
  const hydratedFor = useRef<string>('');

  // (Re)hydrate per-user UI state whenever the signed-in user changes.
  useEffect(() => {
    if (!userId) {
      hydratedFor.current = '';
      setSelection(null);
      setRecents([]);
      return;
    }
    if (hydratedFor.current === userId) return;
    hydratedFor.current = userId;
    setSelection(parseSelection(readStorage(selectionStorageKey(userId))));
    setRecents(parseRecents(readStorage(recentsStorageKey(userId))));
  }, [userId]);

  // First run (or after the stored environment vanished): fall back
  // to the payload's default environment instead of dead-ending.
  useEffect(() => {
    if (!payload || !userId) return;
    if (selection === null) {
      setSelection(defaultEnvironment(payload));
    }
  }, [payload, selection, userId]);

  const current = useMemo(
    () => (payload && selection ? resolveEnvironment(payload, selection) : null),
    [payload, selection],
  );
  const currentInvalid = Boolean(payload && selection && !current);

  const resolvedRecents = useMemo<EnvironmentDescriptor[]>(() => {
    if (!payload) return [];
    return validRecents(recents, payload)
      .map(recent => resolveEnvironment(payload, recent))
      .filter((item): item is EnvironmentDescriptor => item !== null);
  }, [payload, recents]);

  const switchEnvironment = useCallback((next: EnvironmentSelection): boolean => {
    if (payload && !resolveEnvironment(payload, next)) {
      setSwitchProblem('invalid-context');
      return false;
    }
    setSwitchProblem(null);
    setSwitching(true);
    try {
      // Cache isolation: drop every cached server state except the
      // session identity and the environment discovery payload.
      // removeQueries never triggers a fetch, so cache-only
      // skipToken queries stay fetch-free (CORE-UX-FIX-01.1).
      queryClient.removeQueries({
        predicate: query => {
          const root = query.queryKey[0];
          return root !== 'session' && root !== 'environments';
        },
      });
      setSelection(next);
      if (userId) {
        writeStorage(selectionStorageKey(userId), JSON.stringify(next));
        setRecents(previous => {
          const updated = pushRecent(previous, next, Date.now());
          writeStorage(recentsStorageKey(userId), JSON.stringify(updated));
          return updated;
        });
      }
      navigate(landingPathFor(next));
      return true;
    } catch {
      setSwitchProblem('switch-failed');
      return false;
    } finally {
      setSwitching(false);
    }
  }, [navigate, payload, queryClient, userId]);

  const resetToDefault = useCallback(() => {
    if (!payload) return;
    const fallback = defaultEnvironment(payload);
    if (!sameEnvironment(fallback, selection)) switchEnvironment(fallback);
    else setSwitchProblem(null);
  }, [payload, selection, switchEnvironment]);

  const value: EnvironmentContextValue = {
    payload,
    isLoading: !runtime.demoMode && environmentsQuery.isPending && Boolean(userId),
    error: environmentsQuery.error,
    refetch: () => { void environmentsQuery.refetch(); },
    selection,
    current,
    currentInvalid,
    switchEnvironment,
    isSwitching,
    switchProblem,
    clearSwitchProblem: () => setSwitchProblem(null),
    recents: resolvedRecents,
    resetToDefault,
    isOnline,
  };

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment(): EnvironmentContextValue {
  const value = useContext(EnvironmentContext);
  if (!value) throw new Error('EnvironmentProvider required');
  return value;
}
