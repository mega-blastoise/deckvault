import React, { useState, useCallback } from 'react';
import { Modal } from '../Modal';
import { PtcglService } from '../../services/PtcglService';
import type { DeckCard } from '../../../types/deck';
import './PtcglImportModal.css';

interface PtcglImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (cards: DeckCard[]) => void;
}

type Status = 'idle' | 'resolving' | 'resolved' | 'error';

export function PtcglImportModal({ isOpen, onClose, onImport }: PtcglImportModalProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [resolved, setResolved] = useState<DeckCard[]>([]);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const handleResolve = useCallback(async () => {
    if (!text.trim()) return;
    setStatus('resolving');
    setResolved([]);
    setUnresolved([]);
    setErrorMsg('');
    try {
      const svc = new PtcglService();
      const result = await svc.resolve(text);
      setResolved(result.resolved);
      setUnresolved(result.unresolved);
      setStatus('resolved');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to resolve deck list');
      setStatus('error');
    }
  }, [text]);

  const handleImport = useCallback(() => {
    onImport(resolved);
    setText('');
    setStatus('idle');
    setResolved([]);
    setUnresolved([]);
    onClose();
  }, [resolved, onImport, onClose]);

  const handleClose = useCallback(() => {
    setText('');
    setStatus('idle');
    setResolved([]);
    setUnresolved([]);
    setErrorMsg('');
    onClose();
  }, [onClose]);

  const totalCards = resolved.reduce((s, dc) => s + dc.quantity, 0);

  const footer = (
    <>
      <button type="button" className="button button--secondary" onClick={handleClose}>
        Cancel
      </button>
      {status === 'idle' || status === 'error' ? (
        <button
          type="button"
          className="button button--primary"
          onClick={handleResolve}
          disabled={!text.trim()}
        >
          Resolve Cards
        </button>
      ) : status === 'resolving' ? (
        <button type="button" className="button button--primary" disabled>
          Resolving…
        </button>
      ) : (
        <button
          type="button"
          className="button button--primary"
          onClick={handleImport}
          disabled={resolved.length === 0}
        >
          Import {totalCards} Cards
        </button>
      )}
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import from PTCGL" size="medium" footer={footer}>
      <div className="ptcgl-import">
        <p className="ptcgl-import__hint">
          Paste a deck list exported from PTCGL or copied from Limitless TCG / RK9.gg.
        </p>
        <textarea
          className="ptcgl-import__textarea"
          placeholder={`Pokémon: 4\n4 Charizard ex OBF 125\n\nTrainer: 4\n4 Arven OBF 186\n\nEnergy: 8\n8 Basic Fire Energy SVE 2`}
          value={text}
          onChange={(e) => { setText(e.target.value); setStatus('idle'); }}
          rows={14}
          spellCheck={false}
        />

        {status === 'error' && (
          <div className="ptcgl-import__status ptcgl-import__status--error">{errorMsg}</div>
        )}

        {status === 'resolved' && (
          <div className="ptcgl-import__results">
            <div className={`ptcgl-import__status${unresolved.length > 0 ? ' ptcgl-import__status--warn' : ' ptcgl-import__status--ok'}`}>
              {resolved.length > 0
                ? `✓ ${totalCards} cards resolved (${resolved.length} unique)`
                : 'No cards could be resolved — check your list format'}
              {unresolved.length > 0 && ` · ${unresolved.length} line${unresolved.length > 1 ? 's' : ''} unresolved`}
            </div>
            {unresolved.length > 0 && (
              <details className="ptcgl-import__unresolved">
                <summary>Unresolved lines ({unresolved.length})</summary>
                <ul className="ptcgl-import__unresolved-list">
                  {unresolved.map((line, i) => (
                    <li key={i} className="ptcgl-import__unresolved-item">{line}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
