import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/common/Primitives';
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isSessionLoading } = useAuth(); const location = useLocation();
  if (isSessionLoading) return <LoadingState label="در حال بررسی نشست…" />;
  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
