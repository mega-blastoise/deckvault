import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CpService } from '@/web/services/CpService';
import type { CreateCpEntryInput } from '@/web/services/CpService';
import './CpTrackerPage.css';

const DAY2_THRESHOLD = 500;
const WORLDS_THRESHOLD = 1000;

const CURRENT_YEAR = String(new Date().getFullYear());

function cpProgressLabel(total: number): string {
  if (total >= WORLDS_THRESHOLD) return `${total} CP — Worlds invite territory`;
  if (total >= DAY2_THRESHOLD) return `${total} CP — Day 2 qualified!`;
  const remaining = DAY2_THRESHOLD - total;
  return `${total} CP — ${remaining} to Day 2`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface AddFormProps {
  onSubmit: (input: CreateCpEntryInput) => void;
  isPending: boolean;
  onCancel: () => void;
}

function AddEventForm({ onSubmit, isPending, onCancel }: AddFormProps) {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [placement, setPlacement] = useState('');
  const [cpEarned, setCpEarned] = useState('');
  const [format, setFormat] = useState('standard');
  const [notes, setNotes] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cp = parseInt(cpEarned, 10);
    if (!eventName.trim() || !eventDate || isNaN(cp) || cp < 0) return;
    onSubmit({
      eventName: eventName.trim(),
      eventDate,
      placement: placement.trim() || undefined,
      cpEarned: cp,
      format,
      notes: notes.trim() || undefined
    });
  }

  return (
    <form className="cp-tracker__form" onSubmit={handleSubmit}>
      <div className="cp-tracker__form-grid">
        <label className="cp-tracker__label">
          Event Name *
          <input
            type="text"
            className="cp-tracker__input"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Regional Championship"
            maxLength={200}
            required
          />
        </label>

        <label className="cp-tracker__label">
          Date *
          <input
            type="date"
            className="cp-tracker__input"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
          />
        </label>

        <label className="cp-tracker__label">
          Placement
          <input
            type="text"
            className="cp-tracker__input"
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            placeholder="Top 8"
            maxLength={20}
          />
        </label>

        <label className="cp-tracker__label">
          CP Earned *
          <input
            type="number"
            className="cp-tracker__input"
            value={cpEarned}
            onChange={(e) => setCpEarned(e.target.value)}
            placeholder="32"
            min={0}
            max={500}
            required
          />
        </label>

        <label className="cp-tracker__label">
          Format
          <select
            className="cp-tracker__input cp-tracker__select"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="standard">Standard</option>
            <option value="expanded">Expanded</option>
            <option value="unlimited">Unlimited</option>
          </select>
        </label>

        <label className="cp-tracker__label cp-tracker__label--full">
          Notes
          <input
            type="text"
            className="cp-tracker__input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            maxLength={2000}
          />
        </label>
      </div>

      <div className="cp-tracker__form-actions">
        <button type="button" className="cp-tracker__btn cp-tracker__btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cp-tracker__btn cp-tracker__btn--primary" disabled={isPending}>
          {isPending ? 'Saving…' : 'Add Event'}
        </button>
      </div>
    </form>
  );
}

export function CpTrackerPage() {
  const queryClient = useQueryClient();
  const [season, setSeason] = useState(CURRENT_YEAR);
  const [showForm, setShowForm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['cp-entries', season],
    queryFn: () => CpService.list(season),
    staleTime: 60 * 1000
  });

  const createMutation = useMutation({
    mutationFn: CpService.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cp-entries'] });
      setShowForm(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: CpService.delete,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cp-entries'] });
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    }
  });

  const entries = data?.entries ?? [];
  const totalCp = data?.totalCp ?? 0;
  const progressPct = Math.min(100, (totalCp / DAY2_THRESHOLD) * 100);

  const currentYear = new Date().getFullYear();
  const seasonOptions = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <div className="cp-tracker">
      <header className="cp-tracker__header">
        <div>
          <h1 className="cp-tracker__title">CP Tracker</h1>
          <p className="cp-tracker__subtitle">
            Track Championship Points earned at events this season
          </p>
        </div>
        <div className="cp-tracker__header-actions">
          <select
            className="cp-tracker__season-select"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            {seasonOptions.map((y) => (
              <option key={y} value={y}>{y} Season</option>
            ))}
          </select>
          {!showForm && (
            <button
              type="button"
              className="cp-tracker__btn cp-tracker__btn--primary"
              onClick={() => setShowForm(true)}
            >
              + Add Event
            </button>
          )}
        </div>
      </header>

      {/* Progress card */}
      <div className="cp-tracker__summary">
        <div className="cp-tracker__total">{cpProgressLabel(totalCp)}</div>
        <div className="cp-tracker__milestones">
          <span className="cp-tracker__milestone">Day 2: 500 CP</span>
          <span className="cp-tracker__milestone">Worlds: ~1000 CP</span>
        </div>
        <div className="cp-tracker__bar-track">
          <div
            className="cp-tracker__bar-fill"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={totalCp}
            aria-valuemax={DAY2_THRESHOLD}
          />
          <div
            className="cp-tracker__bar-marker"
            style={{ left: `${Math.min(100, (WORLDS_THRESHOLD / DAY2_THRESHOLD) * 100)}%` }}
            title="Worlds threshold (~1000 CP)"
          />
        </div>
      </div>

      {showForm && (
        <div className="cp-tracker__form-wrapper">
          <h3 className="cp-tracker__form-title">Add Event</h3>
          <AddEventForm
            onSubmit={(input) => createMutation.mutate(input)}
            isPending={createMutation.isPending}
            onCancel={() => setShowForm(false)}
          />
          {createMutation.isError && (
            <p className="cp-tracker__error">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to save'}
            </p>
          )}
        </div>
      )}

      {deleteError && (
        <p className="cp-tracker__error">{deleteError}</p>
      )}

      {isLoading && (
        <div className="cp-tracker__state">Loading entries…</div>
      )}

      {error && (
        <div className="cp-tracker__state cp-tracker__state--error">
          Failed to load CP entries.
        </div>
      )}

      {!isLoading && !error && entries.length === 0 && !showForm && (
        <div className="cp-tracker__state">
          No events logged for {season}. Add your first event above.
        </div>
      )}

      {!isLoading && entries.length > 0 && (
        <div className="cp-tracker__table-wrapper">
          <table className="cp-tracker__table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Placement</th>
                <th>Format</th>
                <th className="cp-tracker__th--cp">CP</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="cp-tracker__row">
                  <td className="cp-tracker__cell--name">
                    <span className="cp-tracker__event-name">{entry.event_name}</span>
                    {entry.notes && (
                      <span className="cp-tracker__notes">{entry.notes}</span>
                    )}
                  </td>
                  <td className="cp-tracker__cell--date">{formatDate(entry.event_date)}</td>
                  <td className="cp-tracker__cell--placement">{entry.placement ?? '—'}</td>
                  <td className="cp-tracker__cell--format">
                    <span className={`cp-tracker__format-badge cp-tracker__format-badge--${entry.format}`}>
                      {entry.format.charAt(0).toUpperCase() + entry.format.slice(1)}
                    </span>
                  </td>
                  <td className="cp-tracker__cell--cp">
                    <span className="cp-tracker__cp-value">+{entry.cp_earned}</span>
                  </td>
                  <td className="cp-tracker__cell--actions">
                    <button
                      type="button"
                      className="cp-tracker__delete-btn"
                      onClick={() => {
                        setDeleteError(null);
                        deleteMutation.mutate(entry.id);
                      }}
                      disabled={deleteMutation.isPending}
                      aria-label="Delete entry"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="cp-tracker__total-row">
                <td colSpan={4}>Total</td>
                <td className="cp-tracker__cell--cp">
                  <span className="cp-tracker__cp-total">{totalCp}</span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
