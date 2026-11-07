import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/common/Primitives';
import { MaintenanceScreen } from '../components/maintenance/MaintenanceScreen';
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isSessionLoading, currentUser, maintenance, refreshMaintenance, restoreSession, logoutSession } = useAuth();
  const location = useLocation(); const navigate = useNavigate();
  if (isSessionLoading) return <LoadingState label="در حال بررسی نشست…" />;
  // حالت تعمیر پیش از هر بررسی دیگری اعمال می‌شود: تنها نقش «مدیریت کل سیستم»
  // اجازهٔ دیدن سامانه را دارد؛ بقیه — حتی با نشستِ باز — صفحهٔ تعمیر می‌بینند.
  if (maintenance?.enabled && currentUser.role !== 'admin') {
    return (
      <MaintenanceScreen
        message={maintenance.message}
        startedAt={maintenance.startedAt}
        onRetry={async () => { await refreshMaintenance(); await restoreSession(); }}
        onLogout={isLoggedIn ? logoutSession : undefined}
        onAdminLogin={() => navigate('/login', { replace: true })}
      />
    );
  }
  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
