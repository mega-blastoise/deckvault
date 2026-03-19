import React from 'react';
import { Link, useNavigate } from 'react-router';
import { FileQuestion } from 'lucide-react';
import { ROUTES } from '../routes';

function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="page not-found-page">
      <div className="not-found-page__content">
        <span className="not-found-page__icon">
          <FileQuestion size={64} aria-hidden="true" />
        </span>
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <div className="not-found-page__actions">
          <Link to={ROUTES.HOME} className="button button--primary">
            Go Home
          </Link>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => navigate(-1)}
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
