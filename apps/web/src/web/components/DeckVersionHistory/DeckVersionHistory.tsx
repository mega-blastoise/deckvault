import React, { useState, useCallback } from 'react';
import {
  useVersionsQuery,
  useDiffQuery,
  useLabelMutation,
  type VersionSummary
} from '../../hooks/useVersionsQuery';
import { DeckDiffView } from '../DeckDiffView';
import { useDeckMutations } from '../../hooks/useDeckMutations';
import './DeckVersionHistory.css';

interface Props {
  deckId: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 1000 / 3600;

  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return `Yesterday ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function LabelEditor({
  version,
  deckId,
  onClose
}: {
  version: VersionSummary;
  deckId: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(version.label ?? '');
  const mutation = useLabelMutation(deckId);

  const handleSave = useCallback(async () => {
    await mutation.mutateAsync({ versionId: version.id, label: value });
    onClose();
  }, [mutation, version.id, value, onClose]);

  return (
    <form
      className="version-label-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
    >
      <input
        autoFocus
        className="version-label-editor__input"
        maxLength={80}
        placeholder="Add label…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="button button--primary version-label-editor__btn" disabled={mutation.isPending}>
        Save
      </button>
      <button type="button" className="button button--ghost version-label-editor__btn" onClick={onClose}>
        Cancel
      </button>
    </form>
  );
}

function RestoreModal({
  version,
  onConfirm,
  onCancel,
  isPending
}: {
  version: VersionSummary;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="version-restore-modal">
      <div className="version-restore-modal__box">
        <h3 className="version-restore-modal__title">Restore v{version.version}?</h3>
        <p className="version-restore-modal__body">
          This will overwrite the current deck with the card list from{' '}
          <strong>v{version.version}</strong>
          {version.label ? ` "${version.label}"` : ''} ({formatDate(version.createdAt)}).
          A new version snapshot will be created automatically.
        </p>
        <div className="version-restore-modal__actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeckVersionHistory({ deckId }: Props) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useVersionsQuery(deckId);

  const [selected, setSelected] = useState<[string?, string?]>([undefined, undefined]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VersionSummary | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const [aId, bId] = selected;
  const diffEnabled = Boolean(aId && bId);
  const { data: diffData, isLoading: diffLoading } = useDiffQuery(
    deckId,
    showDiff && aId ? aId : null,
    showDiff && bId ? bId : null
  );

  const { updateMutation } = useDeckMutations();

  const allVersions: VersionSummary[] =
    data?.pages.flatMap((p) => p.versions) ?? [];

  const toggleSelect = useCallback((id: string) => {
    setSelected(([a, b]) => {
      if (a === id) return [undefined, b];
      if (b === id) return [a, undefined];
      if (!a) return [id, b];
      if (!b) return [a, id];
      return [id, b]; // replace oldest selection
    });
  }, []);

  const handleCompare = useCallback(() => {
    if (diffEnabled) setShowDiff(true);
  }, [diffEnabled]);

  const handleRestore = useCallback(
    async (version: VersionSummary) => {
      const res = await fetch(`/api/v1/decks/${deckId}/versions/${version.id}`, {
        credentials: 'include'
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data: { cards: { card: { id: string; name: string; supertype: string; set: { id: string; name: string } }; quantity: number }[] } };
      const cards = json.data.cards;
      await updateMutation.mutateAsync({ id: deckId, input: { cards } });
      setRestoreTarget(null);
    },
    [deckId, updateMutation]
  );

  if (isLoading) {
    return <div className="version-history__loading">Loading version history…</div>;
  }

  if (allVersions.length === 0) {
    return (
      <div className="version-history__empty">
        <p>No versions yet. Save your deck to create the first snapshot.</p>
      </div>
    );
  }

  return (
    <div className="version-history">
      <div className="version-history__toolbar">
        <span className="version-history__count">{allVersions.length} version{allVersions.length !== 1 ? 's' : ''}</span>
        <button
          type="button"
          className="button button--secondary version-history__compare-btn"
          disabled={!diffEnabled}
          onClick={handleCompare}
        >
          Compare {aId && bId ? '2 selected' : '(select 2)'}
        </button>
      </div>

      <ul className="version-history__list">
        {allVersions.map((v, idx) => {
          const isSelected = selected[0] === v.id || selected[1] === v.id;
          const isEditing = editingId === v.id;

          return (
            <li key={v.id} className={`version-history__item${isSelected ? ' version-history__item--selected' : ''}`}>
              <button
                type="button"
                className="version-history__select-btn"
                onClick={() => toggleSelect(v.id)}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} version ${v.version}`}
              >
                <span className={`version-history__dot${idx === 0 ? ' version-history__dot--latest' : ''}`} />
              </button>

              <div className="version-history__item-content">
                <div className="version-history__item-header">
                  <span className="version-history__version-num">v{v.version}</span>
                  {idx === 0 && <span className="version-history__latest-badge">Latest</span>}
                  <span className="version-history__date">{formatDate(v.createdAt)}</span>
                  <span className="version-history__card-count">{v.cardCount} cards</span>
                </div>

                {isEditing ? (
                  <LabelEditor
                    version={v}
                    deckId={deckId}
                    onClose={() => setEditingId(null)}
                  />
                ) : (
                  <div className="version-history__label-row">
                    {v.label ? (
                      <span className="version-history__label">"{v.label}"</span>
                    ) : (
                      <span className="version-history__label-empty">No label</span>
                    )}
                    <button
                      type="button"
                      className="version-history__edit-label"
                      onClick={() => setEditingId(v.id)}
                      title="Edit label"
                    >
                      ✏
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="version-history__restore-btn"
                onClick={() => setRestoreTarget(v)}
                title={`Restore v${v.version}`}
                disabled={idx === 0}
              >
                ↺
              </button>
            </li>
          );
        })}
      </ul>

      {hasNextPage && (
        <button
          type="button"
          className="button button--ghost version-history__load-more"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}

      {showDiff && (
        <div className="version-history__diff-section">
          <div className="version-history__diff-header">
            <h3 className="version-history__diff-title">Diff</h3>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setShowDiff(false)}
            >
              ✕ Close
            </button>
          </div>
          {diffLoading && <p className="version-history__diff-loading">Computing diff…</p>}
          {diffData && <DeckDiffView diff={diffData} />}
        </div>
      )}

      {restoreTarget && (
        <RestoreModal
          version={restoreTarget}
          onConfirm={() => void handleRestore(restoreTarget)}
          onCancel={() => setRestoreTarget(null)}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}
