import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeckFormat } from '../../../types/deck';
import './ReportMatchModal.css';

interface ReportMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MetaDeckOption {
  id: string;
  name: string;
  archetype: string;
}

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  return process.env['API_URL'] ?? 'http://localhost:3001';
}

async function fetchArchetypes(): Promise<MetaDeckOption[]> {
  const res = await fetch(`${getBaseUrl()}/api/v1/meta-decks`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data: MetaDeckOption[] };
  return json.data ?? [];
}

const LOSS_REASONS = [
  { value: 'draw_issues', label: "Couldn't draw what I needed" },
  { value: 'energy_slow', label: 'Energy / setup was too slow' },
  { value: 'bench_slow', label: "Couldn't get Pokémon in play" },
  { value: 'key_card_prized', label: 'Key card was prized' },
  { value: 'hand_disruption', label: 'Opponent disrupted my hand' },
  { value: 'speed', label: 'Opponent was just faster' }
] as const;

async function submitReport(body: {
  archetype: string;
  archetypeName: string;
  format: string;
  result?: string;
  lgsName?: string;
  lossReason?: string;
}): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/v1/local-meta/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to submit report');
  }
}

export function ReportMatchModal({ isOpen, onClose }: ReportMatchModalProps) {
  const queryClient = useQueryClient();
  const [archetypeName, setArchetypeName] = useState('');
  const [format, setFormat] = useState<DeckFormat>('standard');
  const [result, setResult] = useState<'win' | 'loss' | 'tie' | ''>('');
  const [lossReason, setLossReason] = useState<string>('');
  const [lgsName, setLgsName] = useState('');
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const { data: archetypes = [] } = useQuery({
    queryKey: ['meta-decks-list'],
    queryFn: fetchArchetypes,
    staleTime: 300_000,
    enabled: isOpen
  });

  const handleResultChange = useCallback(
    (r: 'win' | 'loss' | 'tie') => {
      setResult((prev) => {
        const next = prev === r ? '' : r;
        if (next !== 'loss') setLossReason('');
        return next;
      });
    },
    []
  );

  const mutation = useMutation({
    mutationFn: submitReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-meta-frequency'] });
      setToast({ message: 'Report submitted!', kind: 'success' });
      setTimeout(() => {
        setToast(null);
        onClose();
        setArchetypeName('');
        setResult('');
        setLossReason('');
        setLgsName('');
      }, 1200);
    },
    onError: (err: Error) => {
      setToast({ message: err.message, kind: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  });

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archetypeName.trim()) return;
    const matched = archetypes.find(
      (a) => a.name.toLowerCase() === archetypeName.toLowerCase()
    );
    const archetype = matched?.archetype ?? archetypeName.toLowerCase().replace(/\s+/g, '-');
    mutation.mutate({
      archetype,
      archetypeName: archetypeName.trim(),
      format,
      result: result || undefined,
      lgsName: lgsName.trim() || undefined,
      lossReason: lossReason || undefined
    });
  }

  return createPortal(
    <div className="report-modal__overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="report-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Report a Match">
        <div className="report-modal__header">
          <h2 className="report-modal__title">Report a Match</h2>
          <button type="button" className="report-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {toast && (
          <div className={`report-modal__toast report-modal__toast--${toast.kind}`}>
            {toast.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="report-match-form">
          <label className="report-match-form__label">
            <span>Opponent's Archetype</span>
            <input
              list="archetypes-datalist"
              className="report-match-form__input"
              value={archetypeName}
              onChange={(e) => setArchetypeName(e.target.value)}
              placeholder="e.g. Charizard ex / Pidgeot ex"
              required
            />
            <datalist id="archetypes-datalist">
              {archetypes.map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
          </label>

          <label className="report-match-form__label">
            <span>Format</span>
            <select
              className="report-match-form__select"
              value={format}
              onChange={(e) => setFormat(e.target.value as DeckFormat)}
            >
              <option value="standard">Standard</option>
              <option value="expanded">Expanded</option>
            </select>
          </label>

          <div className="report-match-form__label">
            <span>Result (optional)</span>
            <div className="report-match-form__result-btns">
              {(['win', 'loss', 'tie'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`report-match-form__result-btn${result === r ? ' report-match-form__result-btn--active' : ''} report-match-form__result-btn--${r}`}
                  onClick={() => handleResultChange(r)}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {result === 'loss' && (
            <div className="report-match-form__label">
              <span>Why did you lose? (optional)</span>
              <div className="report-match-form__loss-reasons">
                {LOSS_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    className={`report-match-form__loss-reason-btn${lossReason === reason.value ? ' report-match-form__loss-reason-btn--active' : ''}`}
                    onClick={() =>
                      setLossReason((prev) => (prev === reason.value ? '' : reason.value))
                    }
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="report-match-form__label">
            <span>LGS Name (optional)</span>
            <input
              className="report-match-form__input"
              value={lgsName}
              onChange={(e) => setLgsName(e.target.value)}
              placeholder="Your local game store"
            />
          </label>

          <button
            type="submit"
            className="button button--primary report-match-form__submit"
            disabled={mutation.isPending || !archetypeName.trim()}
          >
            {mutation.isPending ? 'Submitting…' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
