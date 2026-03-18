import React from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../contexts/Auth';

function SignInPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/';

  if (isLoading) {
    return (
      <div className="page sign-in-page">
        <div className="page__content">
          <div className="page__empty-state">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  const googleAuthUrl = `/auth/google?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="page sign-in-page">
      <div className="sign-in-page__container">
        <div className="sign-in-page__card">
          <h1 className="sign-in-page__title">Welcome Back</h1>
          <p className="sign-in-page__subtitle">
            Sign in to manage your collection and decks
          </p>
          <a href={googleAuthUrl} className="sign-in-page__google-btn">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              />
            </svg>
            <span>Continue with Google</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default SignInPage;
