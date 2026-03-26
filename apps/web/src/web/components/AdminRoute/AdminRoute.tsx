import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/Auth';

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page">
        <div className="page__content">
          <div className="page__empty-state">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?returnTo=${returnTo}`} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="page__content">
          <div className="admin-forbidden">
            <h1>403 — Forbidden</h1>
            <p>You don't have permission to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
