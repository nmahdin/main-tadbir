import { activateSnapshotSession, snapshotSession } from '../queries/serverSnapshots';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import { authApi, type LoginPayload } from '../api/auth';
import { queryClient } from '../queries/queryClient';
import { runtime } from '../config/runtime';
import { ApiError, SessionChangedError, parseApiError, readMaintenanceState, type MaintenanceState } from '../api/errors';
import { settingsApi } from '../api/settings';
import { takeBalePanelToken } from '../auth/balePanelSession';

const anonymous: User = { id: '', name: '', avatar: '', role: '', status: 'inactive', title: '', department: '',
  activeProjectsCount: 0, completedTasksCount: 0, workloadPercentage: 0, skills: [], createdAt: '', permissions: [] };
function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  // وضعیت «حالت تعمیر»: تا وقتی روشن است، فقط نقش مدیریت کل سیستم وارد می‌شود.
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const generation = useRef(0);
  const loginPending = useRef(false);
  const balePanelToken = useRef<string | null>(null);
  /**
   * خواندنِ وضعیت تعمیر از نقطهٔ عمومیِ سامانه.
   *
   * همین درخواست هویت بصری صفحهٔ ورود را هم می‌آورد؛ عمداً از `public/identity`
   * خوانده می‌شود چون پیش از احراز هویت هم در دسترس است.
   */
  const refreshMaintenance = async (): Promise<MaintenanceState | null> => {
    if (runtime.demoMode) return null;
    try {
      const response = await settingsApi.publicIdentity();
      const state = response.data.maintenance;
      if (state?.enabled) {
        const next: MaintenanceState = {
          enabled: true,
          message: typeof state.message === 'string' && state.message.trim() !== ''
            ? state.message
            : 'سامانه در حال تعمیر است؛ لطفاً چند دقیقهٔ دیگر دوباره تلاش کنید.',
          startedAt: state.startedAt ?? null,
        };
        setMaintenance(next);
        return next;
      }
      setMaintenance(null);
      return null;
    } catch {
      // خطای شبکه وضعیت تعمیر را تغییر نمی‌دهد؛ آخرین وضعیت شناخته‌شده حفظ می‌شود.
      return maintenance;
    }
  };
  const clearSession = () => {
    generation.current++;
    activateSnapshotSession('');
    void queryClient.cancelQueries(); queryClient.clear(); setUser(null); setSessionLoading(false);
  };
  const restoreSession = async () => {
    if (runtime.demoMode || loginPending.current) return;
    const version = ++generation.current; setSessionLoading(true); setSessionError(null);
    try {
      const response = await queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => authApi.me(), retry: false });
      if (version === generation.current) {
        if (snapshotSession().userId !== response.data.id) {
          activateSnapshotSession(response.data.id);
          queryClient.clear();
        }
        setUser(response.data);
      }
    } catch (error) {
      if (version === generation.current) {
        setUser(null);
        // حالت تعمیر یک وضعیت شناخته‌شده است، نه خطای اتصال؛ صفحهٔ تعمیر جای
        // پیام «نشست منقضی» یا «انجام نشد» را می‌گیرد.
        const blocked = readMaintenanceState(error);
        if (blocked) { setMaintenance(blocked); setSessionError(null); }
        else {
          // A visitor without a session is expected, not a failed connection.
          // A 404 here points to a deployment/API-base mismatch, not a missing domain record.
          setSessionError(error instanceof ApiError && error.status === 401 ? null
            : error instanceof ApiError && error.status === 404 ? 'سرویس ورود در آدرس تنظیم‌شدهٔ API پیدا نشد.'
              : parseApiError(error).message);
        }
      }
    } finally { if (version === generation.current) setSessionLoading(false); }
  };
  const loginFromBalePanel = async (token: string) => {
    if (loginPending.current) return;
    loginPending.current = true;
    const version = ++generation.current;
    setSessionLoading(true); setSessionError(null);
    void queryClient.cancelQueries();
    try {
      const response = await authApi.loginFromBalePanel(token);
      if (version !== generation.current) return;
      activateSnapshotSession(response.data.id);
      queryClient.clear(); setUser(response.data); setSessionError(null);
    } catch (error) {
      if (version === generation.current) {
        setUser(null);
        setSessionError(error instanceof ApiError && error.status === 422
          ? 'پیوند ورود ربات منقضی یا قبلاً استفاده شده است؛ از جدیدترین منوی ربات وارد شوید.'
          : parseApiError(error).message);
      }
    } finally {
      loginPending.current = false;
      if (version === generation.current) setSessionLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    let panelTimer: number | null = null;
    if (!runtime.demoMode && !balePanelToken.current) balePanelToken.current = takeBalePanelToken();
    const panelToken = balePanelToken.current;
    if (runtime.demoMode) {
      void import('../demo').then(({ demo }) => {
        if (!active) return;
        const demoUser = demo.users[0] ?? null;
        if (demoUser) activateSnapshotSession(demoUser.id);
        setUser(demoUser);
        setSessionLoading(false);
      }).catch(() => { if (active) setSessionLoading(false); });
    } else if (panelToken) {
      // Delay one task so React StrictMode's development-only effect replay cannot
      // consume the one-time credential twice.
      panelTimer = window.setTimeout(() => void loginFromBalePanel(panelToken), 0);
    } else {
      void refreshMaintenance();
      void restoreSession();
    }
    const expired = () => { clearSession(); setSessionError('نشست منقضی شده است؛ دوباره وارد شوید.'); };
    // هر درخواستِ ردشده در حالت تعمیر این رویداد را می‌فرستد؛ حتی اگر کاربر
    // وسط کار باشد، رابط کاربری بلافاصله صفحهٔ تعمیر را نشان می‌دهد.
    const maintenanceStarted = (event: Event) => {
      const detail = (event as CustomEvent).detail as Partial<MaintenanceState> | undefined;
      setMaintenance({
        enabled: true,
        message: typeof detail?.message === 'string' && detail.message.trim() !== ''
          ? detail.message
          : 'سامانه در حال تعمیر است؛ لطفاً چند دقیقهٔ دیگر دوباره تلاش کنید.',
        startedAt: typeof detail?.startedAt === 'string' ? detail.startedAt : null,
      });
    };
    window.addEventListener('tadbir:session-expired', expired);
    window.addEventListener('tadbir:maintenance-mode', maintenanceStarted);
    return () => { active = false; if (panelTimer !== null) window.clearTimeout(panelTimer); generation.current++; window.removeEventListener('tadbir:session-expired', expired); window.removeEventListener('tadbir:maintenance-mode', maintenanceStarted); };
  }, []);
  const login = async (payload: LoginPayload) => {
    if (loginPending.current) throw new ApiError('درخواست ورود در حال انجام است.', 409);
    loginPending.current = true;
    // Explicit login supersedes an earlier restore BEFORE awaiting CSRF/network.
    const version = ++generation.current;
    void queryClient.cancelQueries({ queryKey: ['session'] });
    try {
      const response = await authApi.login(payload);
      if (version !== generation.current) throw new SessionChangedError();
      // Always rotate for a successful login, even for the same account.
      activateSnapshotSession(response.data.id);
      queryClient.clear(); setUser(response.data); setSessionError(null); setSessionLoading(false);
      return response;
    } finally {
      loginPending.current = false;
      if (version === generation.current) setSessionLoading(false);
    }
  };
  const loginWithBale = async (loginName: string, code: string, remember = false) => {
    if (loginPending.current) throw new ApiError('درخواست ورود در حال انجام است.', 409);
    loginPending.current = true;
    const version = ++generation.current;
    void queryClient.cancelQueries({ queryKey: ['session'] });
    try {
      const response = await authApi.loginWithBale(loginName, code, remember);
      if (version !== generation.current) throw new SessionChangedError();
      activateSnapshotSession(response.data.id);
      queryClient.clear(); setUser(response.data); setSessionError(null); setSessionLoading(false);
      return response;
    } finally {
      loginPending.current = false;
      if (version === generation.current) setSessionLoading(false);
    }
  };
  const logoutSession = async () => {
    // Do not claim server logout when its request failed. Keep the session for retry.
    if (!runtime.demoMode) await authApi.logout();
    clearSession();
  };
  return { user, sessionEpoch: snapshotSession().epoch, currentUser: user ?? anonymous, isLoggedIn: !!user, isSessionLoading, sessionError,
    setCurrentUser: (next: React.SetStateAction<User>) => setUser(prev => prev ? (typeof next === 'function' ? next(prev) : (next.id === prev.id ? next : prev)) : null),
    maintenance, refreshMaintenance, login, loginWithBale, logoutSession, clearSession, restoreSession };
}
const AuthContext = createContext<ReturnType<typeof useSession> | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) { return <AuthContext.Provider value={useSession()}>{children}</AuthContext.Provider>; }
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider required'); return value; }
