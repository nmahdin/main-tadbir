import { clearServerSnapshots, activateSnapshotSession } from '../queries/serverSnapshots';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import { authApi, type LoginPayload } from '../api/auth';
import { queryClient } from '../queries/queryClient';
import { runtime } from '../config/runtime';
import { demo } from '../demo';
import { parseApiError } from '../api/errors';

const anonymous: User = { id: '', name: '', email: '', avatar: '', role: '', status: 'inactive', title: '', department: '',
  activeProjectsCount: 0, completedTasksCount: 0, workloadPercentage: 0, skills: [], createdAt: '', permissions: [] };
function useSession() {
  const [user, setUser] = useState<User | null>(runtime.demoMode ? demo.users[0] ?? null : null);
  const [isSessionLoading, setSessionLoading] = useState(!runtime.demoMode);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const generation = useRef(0);
  const clearSession = () => {
    generation.current++;
    void queryClient.cancelQueries(); queryClient.clear(); clearServerSnapshots(); activateSnapshotSession(''); setUser(null); setSessionLoading(false);
  };
  const restoreSession = async () => {
    if (runtime.demoMode) return;
    const version = ++generation.current; setSessionLoading(true); setSessionError(null);
    try {
      const response = await queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => authApi.me(), retry: false });
      if (version === generation.current) { activateSnapshotSession(response.data.id); setUser(response.data); }
    } catch (error) {
      if (version === generation.current) { setUser(null); setSessionError(parseApiError(error).message); }
    } finally { if (version === generation.current) setSessionLoading(false); }
  };
  useEffect(() => {
    void restoreSession();
    const expired = () => { clearSession(); setSessionError('نشست منقضی شده است؛ دوباره وارد شوید.'); };
    window.addEventListener('tadbir:session-expired', expired);
    return () => { generation.current++; window.removeEventListener('tadbir:session-expired', expired); };
  }, []);
  const login = async (payload: LoginPayload) => {
    const response = await authApi.login(payload);
    generation.current++; queryClient.clear(); clearServerSnapshots(); activateSnapshotSession(response.data.id); setUser(response.data); setSessionError(null); setSessionLoading(false);
    return response;
  };
  const logoutSession = async () => {
    // Do not claim server logout when its request failed. Keep the session for retry.
    if (!runtime.demoMode) await authApi.logout();
    clearSession();
  };
  return { user, currentUser: user ?? anonymous, isLoggedIn: !!user, isSessionLoading, sessionError,
    setCurrentUser: (next: React.SetStateAction<User>) => setUser(prev => prev ? (typeof next === 'function' ? next(prev) : (next.id === prev.id ? next : prev)) : null),
    login, logoutSession, clearSession, restoreSession };
}
const AuthContext = createContext<ReturnType<typeof useSession> | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) { return <AuthContext.Provider value={useSession()}>{children}</AuthContext.Provider>; }
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider required'); return value; }
