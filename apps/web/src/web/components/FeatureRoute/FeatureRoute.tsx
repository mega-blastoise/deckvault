import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@/web/contexts/Toast';

interface FeatureRouteProps {
  feature: string;
  children: React.ReactNode;
}

export function FeatureRoute({ feature, children }: FeatureRouteProps) {
  const enabled =
    typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>)[`FEATURE_${feature}`] === true
      : false;

  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (!enabled) {
      showToast('This feature is not publicly available yet.', 'info');
      navigate('/', { replace: true });
    }
  }, [enabled, navigate, showToast]);

  if (!enabled) return null;
  return <>{children}</>;
}
