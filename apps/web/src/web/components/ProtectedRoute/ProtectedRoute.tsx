import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/Auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
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

  return <>{children}</>;
}
