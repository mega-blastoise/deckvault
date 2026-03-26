import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../contexts/Auth';

type MagicLinkStatus = 'idle' | 'loading' | 'sent' | 'error';

function SignInPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/';

  const [email, setEmail] = useState('');
  const [magicLinkStatus, setMagicLinkStatus] = useState<MagicLinkStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

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

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setMagicLinkStatus('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), returnTo })
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string | { message?: string } };
        const err = body.error;
        const msg = typeof err === 'string' ? err : (err?.message ?? 'Something went wrong');
        throw new Error(msg);
      }
      setMagicLinkStatus('sent');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send link');
      setMagicLinkStatus('error');
    }
  }

  return (
    <div className="page sign-in-page">
      <div className="sign-in-page__container">
        <div className="sign-in-page__card">
          <div className="sign-in-page__logo" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="47" fill="#f5f5f5"/>
              <path d="M3,50 A47,47 0 0,1 97,50 Z" fill="#cc2222"/>
              <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="6"/>
              <rect x="3" y="44" width="94" height="12" fill="currentColor"/>
              <circle cx="50" cy="50" r="13" fill="currentColor"/>
              <circle cx="50" cy="50" r="9" fill="#f5f5f5"/>
            </svg>
          </div>
          <h1 className="sign-in-page__title">Welcome to DeckVault</h1>
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

          <div className="sign-in-page__divider">
            <span>or</span>
          </div>

          {magicLinkStatus === 'sent' ? (
            <div className="sign-in-page__sent">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 6l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="sign-in-page__sent-title">Check your inbox</p>
              <p className="sign-in-page__sent-body">
                We sent a magic link to <strong>{email}</strong>. Click it to sign in — it expires in 30 minutes.
              </p>
              <button
                type="button"
                className="sign-in-page__resend-btn"
                onClick={() => setMagicLinkStatus('idle')}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form className="sign-in-page__magic-form" onSubmit={handleMagicLink} noValidate>
              <label className="sign-in-page__email-label" htmlFor="magic-link-email">
                Email address
              </label>
              <input
                id="magic-link-email"
                type="email"
                className="sign-in-page__email-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={magicLinkStatus === 'loading'}
                required
                autoComplete="email"
              />
              {magicLinkStatus === 'error' && (
                <p className="sign-in-page__magic-error">{errorMessage}</p>
              )}
              <button
                type="submit"
                className="sign-in-page__magic-btn"
                disabled={magicLinkStatus === 'loading' || !email.trim()}
              >
                {magicLinkStatus === 'loading' ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default SignInPage;
