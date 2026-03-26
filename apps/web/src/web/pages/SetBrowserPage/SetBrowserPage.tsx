import React from 'react';
import { useNavigate } from 'react-router';
import { useSets } from '@/web/hooks/useSets';
import { ROUTES } from '@/web/routes';
import type { Pokemon } from '@pokemon/clients';
import './SetBrowserPage.css';

type SetsData = { data: Pokemon.Set[] };

function SetBrowserPage() {
  const navigate = useNavigate();
  const result = useSets();
  const sets: Pokemon.Set[] = result.data
    ? (result.data.data as unknown as SetsData).data ?? []
    : [];

  return (
    <div className="page set-browser-page">
      <div className="page__header">
        <h1>Sets</h1>
        <p>Browse all Pokemon TCG sets.</p>
      </div>

      <div className="page__content">
        {result.isLoading && (
          <div className="set-browser-page__loading">Loading sets…</div>
        )}

        {result.isError && (
          <div className="set-browser-page__error">
            Failed to load sets. Please try again.
          </div>
        )}

        {!result.isLoading && sets.length > 0 && (
          <div className="set-browser-page__grid">
            {sets.map((set) => {
              const logo = (set.images as { logo?: string })?.logo;
              return (
                <button
                  key={set.id}
                  type="button"
                  className="set-browser-page__card"
                  onClick={() => navigate(ROUTES.SET_DETAIL(set.id))}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={set.name}
                      className="set-browser-page__card-logo"
                      loading="lazy"
                    />
                  ) : (
                    <div className="set-browser-page__card-logo-placeholder">
                      {set.name[0]}
                    </div>
                  )}
                  <div className="set-browser-page__card-name">{set.name}</div>
                  <div className="set-browser-page__card-meta">
                    <span className="set-browser-page__card-series">{set.series}</span>
                    <span className="set-browser-page__card-count">
                      {set.total ?? set.printedTotal} cards
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { SetBrowserPage };
