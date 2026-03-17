import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { CardsService } from '../../services/CardsService';
import type { Deck, DeckCard } from '../../../types/deck';
import { FORMAT_NAMES } from '../../../types/deck';

interface CardPrintInfo {
  id: string;
  name: string;
  setCode: string;
  number: string;
  regulationMark: string;
  quantity: number;
  supertype: string;
}

interface DeckPrintViewProps {
  deck: Deck;
  onClose: () => void;
}

function extractSetCode(cardId: string): string {
  const dashIdx = cardId.lastIndexOf('-');
  return dashIdx > 0 ? cardId.slice(0, dashIdx) : cardId;
}

function buildPrintCards(
  deckCards: DeckCard[],
  enrichedMap: Map<string, { regulationMark?: string; number?: string }>
): CardPrintInfo[] {
  return deckCards.map((dc) => {
    const enriched = enrichedMap.get(dc.card.id);
    const setCode = dc.card.set?.id ?? extractSetCode(dc.card.id);
    const number = enriched?.number
      ?? (dc.card as Record<string, unknown>).number as string | undefined
      ?? dc.card.number
      ?? '';
    const regulationMark = enriched?.regulationMark
      ?? (dc.card as Record<string, unknown>).regulationMark as string | undefined
      ?? dc.card.regulationMark
      ?? '';

    return {
      id: dc.card.id,
      name: dc.card.name,
      setCode: setCode.toUpperCase(),
      number: String(number),
      regulationMark,
      quantity: dc.quantity,
      supertype: dc.card.supertype
    };
  });
}

function groupBySupertype(cards: CardPrintInfo[]) {
  const groups: Record<string, CardPrintInfo[]> = {
    'Pokémon': [],
    Trainer: [],
    Energy: []
  };
  for (const card of cards) {
    const key = card.supertype === 'Pokémon' ? 'Pokémon' : card.supertype;
    if (!groups[key]) groups[key] = [];
    groups[key].push(card);
  }
  return groups;
}

function groupCount(cards: CardPrintInfo[]): number {
  return cards.reduce((sum, c) => sum + c.quantity, 0);
}

export function DeckPrintView({ deck, onClose }: DeckPrintViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [division, setDivision] = useState('Masters');
  const [enrichedMap, setEnrichedMap] = useState<
    Map<string, { regulationMark?: string; number?: string }>
  >(new Map());
  const [isEnriching, setIsEnriching] = useState(false);

  useEffect(() => {
    const ids = deck.cards.map((dc) => dc.card.id);
    if (ids.length === 0) return;

    setIsEnriching(true);
    const service = new CardsService();
    service
      .getCardsBatch(ids)
      .then((res) => {
        const map = new Map<string, { regulationMark?: string; number?: string }>();
        const cards = (res.data as { data: Array<Record<string, unknown>> }).data ?? [];
        for (const card of cards) {
          map.set(card.id as string, {
            regulationMark: card.regulationMark as string | undefined,
            number: String(card.number ?? '')
          });
        }
        setEnrichedMap(map);
      })
      .catch(() => {
        // Enrichment failed — regulation marks will be blank
      })
      .finally(() => setIsEnriching(false));
  }, [deck.cards]);

  const printCards = useMemo(
    () => buildPrintCards(deck.cards, enrichedMap),
    [deck.cards, enrichedMap]
  );

  const grouped = useMemo(() => groupBySupertype(printCards), [printCards]);
  const totalCards = useMemo(
    () => printCards.reduce((sum, c) => sum + c.quantity, 0),
    [printCards]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const now = new Date();
  const createdDate = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;

  return (
    <div className="deck-print-overlay">
      <div className="deck-print-overlay__toolbar no-print">
        <h2>Tournament Deck List</h2>
        <div className="deck-print-overlay__toolbar-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handlePrint}
            disabled={isEnriching}
          >
            {isEnriching ? 'Loading...' : 'Print'}
          </button>
        </div>
      </div>

      <div className="deck-print-overlay__form no-print">
        <div className="deck-print-overlay__field">
          <label htmlFor="print-player-name">Player Name</label>
          <input
            id="print-player-name"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Full Name"
          />
        </div>
        <div className="deck-print-overlay__field">
          <label htmlFor="print-player-id">Player ID</label>
          <input
            id="print-player-id"
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            placeholder="0000000"
          />
        </div>
        <div className="deck-print-overlay__field">
          <label htmlFor="print-birthdate">Date of Birth</label>
          <input
            id="print-birthdate"
            type="text"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            placeholder="MM/DD/YYYY"
          />
        </div>
        <div className="deck-print-overlay__field">
          <label htmlFor="print-division">Division</label>
          <select
            id="print-division"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          >
            <option value="Junior">Junior</option>
            <option value="Senior">Senior</option>
            <option value="Masters">Masters</option>
          </select>
        </div>
      </div>

      <div ref={printRef} className="deck-print-sheet">
        {/* Header */}
        <div className="deck-print-sheet__header">
          <div className="deck-print-sheet__player-info">
            <div className="deck-print-sheet__field-row">
              <span className="deck-print-sheet__label">Player Name:</span>
              <span className="deck-print-sheet__value">{playerName || '\u00A0'}</span>
            </div>
            <div className="deck-print-sheet__field-row">
              <span className="deck-print-sheet__label">Player ID:</span>
              <span className="deck-print-sheet__value">{playerId || '\u00A0'}</span>
            </div>
            <div className="deck-print-sheet__field-row">
              <span className="deck-print-sheet__label">Birthdate (MM/DD/YY):</span>
              <span className="deck-print-sheet__value">{birthdate || '\u00A0'}</span>
            </div>
            <div className="deck-print-sheet__field-row">
              <span className="deck-print-sheet__label">Division:</span>
              <span className="deck-print-sheet__value">{division}</span>
            </div>
          </div>
          <div className="deck-print-sheet__meta-info">
            <div className="deck-print-sheet__field-row">
              <span className="deck-print-sheet__label">Format:</span>
              <span className="deck-print-sheet__value">
                {FORMAT_NAMES[deck.format]}
              </span>
            </div>
            <div className="deck-print-sheet__field-row">
              <span className="deck-print-sheet__label">Created:</span>
              <span className="deck-print-sheet__value">{createdDate}</span>
            </div>
            <div className="deck-print-sheet__field-row">
              <span className="deck-print-sheet__label">Total:</span>
              <span className="deck-print-sheet__value">{totalCards}</span>
            </div>
          </div>
        </div>

        {/* Card Groups */}
        {(['Pokémon', 'Trainer', 'Energy'] as const).map((supertype) => {
          const cards = grouped[supertype];
          if (!cards || cards.length === 0) return null;
          const count = groupCount(cards);

          return (
            <div key={supertype} className="deck-print-sheet__group">
              <h3 className="deck-print-sheet__group-title">
                {supertype} ({count})
              </h3>
              <table className="deck-print-sheet__table">
                <tbody>
                  {cards.map((card) => (
                    <tr key={card.id} className="deck-print-sheet__row">
                      <td className="deck-print-sheet__qty">{card.quantity}</td>
                      <td className="deck-print-sheet__name">{card.name}</td>
                      <td className="deck-print-sheet__set">
                        {card.setCode}-{card.number}
                      </td>
                      <td className="deck-print-sheet__reg">
                        {card.regulationMark || ''}
                      </td>
                      <td className="deck-print-sheet__check">
                        <span className="deck-print-sheet__checkbox" />
                        <span className="deck-print-sheet__checkbox" />
                        <span className="deck-print-sheet__checkbox" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Footer */}
        <div className="deck-print-sheet__footer">
          <p>Deck: {deck.name}</p>
        </div>
      </div>
    </div>
  );
}
