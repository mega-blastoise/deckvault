import React from 'react';
import { ReportMatchModal } from '../../components/ReportMatchModal';
import { pipeline } from '../../utils/pipeline';
import type { LocalMetaPageViewProps } from './types';

const FORMAT_OPTIONS = [
  { value: 'all', label: 'All Formats' },
  { value: 'standard', label: 'Standard' },
  { value: 'expanded', label: 'Expanded' }
];

function LocalMetaPageViewComponent({
  format,
  archetypes,
  maxCount,
  isLoading,
  data,
  isAuthenticated,
  reportModalOpen,
  onFormatChange,
  onOpenReportModal,
  onCloseReportModal
}: LocalMetaPageViewProps) {
  return (
    <div className="page local-meta-page">
      <div className="page__header local-meta-page__header">
        <div>
          <h1>Local Meta Intelligence</h1>
          <p>What people are playing near you — last 30 days</p>
        </div>
        {isAuthenticated && (
          <div className="page__header-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={onOpenReportModal}
            >
              + Report a Match
            </button>
          </div>
        )}
      </div>

      <div className="local-meta-page__toolbar">
        <div className="local-meta-page__format-pills">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`local-meta-page__format-pill${format === opt.value ? ' local-meta-page__format-pill--active' : ''}`}
              onClick={() => onFormatChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="local-meta-page__loading">Loading…</div>
      ) : archetypes.length === 0 ? (
        <div className="local-meta-page__empty">
          <p>No reports yet for this format. Be the first to report!</p>
          {isAuthenticated && (
            <button
              type="button"
              className="button button--primary"
              onClick={onOpenReportModal}
            >
              + Report a Match
            </button>
          )}
        </div>
      ) : (
        <div className="local-meta-page__chart">
          {archetypes.map((a, i) => {
            const winRate = a.winCount + a.lossCount + a.tieCount > 0
              ? Math.round((a.winCount / (a.winCount + a.lossCount + a.tieCount)) * 100)
              : null;
            return (
              <div key={a.archetype} className="local-meta-row">
                <span className="local-meta-row__rank">#{i + 1}</span>
                <div className="local-meta-row__main">
                  <div className="local-meta-row__name-row">
                    <span className="local-meta-row__name">{a.archetypeName}</span>
                    {winRate !== null && (
                      <span className="local-meta-row__winrate">{winRate}% win</span>
                    )}
                    <span className="local-meta-row__count">{a.reportCount}</span>
                  </div>
                  <div className="local-meta-row__bar-track">
                    <div
                      className="local-meta-row__bar"
                      style={
                        {
                          '--count': a.reportCount,
                          '--max-count': maxCount
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && (
        <p className="local-meta-page__footer">
          Based on {data.totalReports} report{data.totalReports !== 1 ? 's' : ''} from the community (last {data.dayRange} days)
        </p>
      )}

      {isAuthenticated && (
        <ReportMatchModal
          isOpen={reportModalOpen}
          onClose={onCloseReportModal}
        />
      )}
    </div>
  );
}

export const LocalMetaPageView = pipeline(React.memo)(LocalMetaPageViewComponent);
