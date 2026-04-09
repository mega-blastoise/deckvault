import React, { Suspense } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';

interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

class QueryBoundaryErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      const retry = () => {
        this.setState({ error: null });
        this.props.onReset?.();
      };
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="query-boundary__error">
          <p>Something went wrong.</p>
          <button type="button" className="button button--secondary" onClick={retry}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface QueryBoundaryProps {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

export function QueryBoundary({ children, loadingFallback, errorFallback }: QueryBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <QueryBoundaryErrorBoundary fallback={errorFallback} onReset={reset}>
          <Suspense fallback={loadingFallback ?? <div className="query-boundary__loading">Loading…</div>}>
            {children}
          </Suspense>
        </QueryBoundaryErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
