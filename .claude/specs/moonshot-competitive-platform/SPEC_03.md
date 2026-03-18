# SPEC_03: Deck Analytics Engine

## Context

Players iterate on decks blind, with no probability data. This spec builds a pure-math analytics
library and a four-panel UI that answers the four key questions for every deck: opening consistency,
prize mapping risk, energy curve health, and simulation. All calculations are deterministic functions
— no external dependencies, easy to unit test.

---

## Prerequisites

- SPEC_01 complete
- A valid 60-card deck must exist in the database (DeckBuilderPage already handles this)

---

## Requirements

### 1. The `deck-math` Library

Pure TypeScript functions in `apps/web/src/web/lib/deck-math/`. No side effects, no imports from
the rest of the app. Each module exports named functions only.

#### 1a. `hypergeometric.ts` — Core Probability Primitive

The hypergeometric distribution is the basis for all card probability calculations in a 60-card deck.

```typescript
// apps/web/src/web/lib/deck-math/hypergeometric.ts

/**
 * P(X = k): probability of drawing exactly k successes
 * in a sample of n draws from a population of N containing K successes.
 *
 * Uses log-space arithmetic to avoid integer overflow for large combinations.
 */
export function hypergeometricPMF(N: number, K: number, n: number, k: number): number {
  if (k > K || k > n || n - k > N - K) return 0;
  return Math.exp(
    logCombination(K, k) + logCombination(N - K, n - k) - logCombination(N, n)
  );
}

/**
 * P(X >= k): probability of drawing AT LEAST k successes.
 */
export function hypergeometricCDF(N: number, K: number, n: number, minK: number): number {
  let probability = 0;
  for (let k = minK; k <= Math.min(K, n); k++) {
    probability += hypergeometricPMF(N, K, n, k);
  }
  return Math.min(1, probability);
}

/**
 * log(C(n, k)) using Stirling / log-gamma to avoid overflow.
 */
function logCombination(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function logFactorial(n: number): number {
  let result = 0;
  for (let i = 2; i <= n; i++) result += Math.log(i);
  return result;
}
```

#### 1b. `opening-hand.ts` — Opening Hand Consistency

```typescript
// apps/web/src/web/lib/deck-math/opening-hand.ts
import { hypergeometricCDF } from './hypergeometric';

export interface CardProbability {
  cardId: string;
  name: string;
  quantity: number;
  /** P(drawing >= 1 in opening hand of handSize) */
  probAtLeastOne: number;
  /** P(drawing >= 2 in opening hand of handSize) */
  probAtLeastTwo: number;
}

/**
 * For each unique card in the deck, compute the probability of drawing
 * at least 1 copy and at least 2 copies in an opening hand.
 *
 * @param deckCards - Array of { cardId, name, quantity } for all 60 cards
 * @param handSize - Default 7 (standard opening hand)
 * @param deckSize - Default 60
 */
export function openingHandProbabilities(
  deckCards: { cardId: string; name: string; quantity: number }[],
  handSize = 7,
  deckSize = 60
): CardProbability[] {
  return deckCards.map((card) => ({
    cardId: card.cardId,
    name: card.name,
    quantity: card.quantity,
    probAtLeastOne: hypergeometricCDF(deckSize, card.quantity, handSize, 1),
    probAtLeastTwo: hypergeometricCDF(deckSize, card.quantity, handSize, 2),
  }));
}

/**
 * Consistency score: probability of drawing all specified "combo" cards
 * by the end of turn 2 (opening hand of 7 + 2 draw steps = 9 cards seen).
 */
export function comboConsistency(
  deckSize: number,
  combo: { quantity: number }[],
  cardsSeen = 9
): number {
  // Approximation: multiply individual probabilities (assumes independence — acceptable for small combos)
  return combo.reduce(
    (acc, card) => acc * hypergeometricCDF(deckSize, card.quantity, cardsSeen, 1),
    1
  );
}
```

#### 1c. `prize-risk.ts` — Prize Mapping Risk

```typescript
// apps/web/src/web/lib/deck-math/prize-risk.ts
import { hypergeometricPMF } from './hypergeometric';

export interface PrizeRisk {
  cardId: string;
  name: string;
  quantity: number;
  /** P(at least 1 copy is among the 6 prize cards) */
  probAtLeastOnePrized: number;
  /** P(ALL copies are prized — catastrophic loss) */
  probAllPrized: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Compute prize mapping risk for each card in the deck.
 * Uses hypergeometric: drawing 6 prizes from 60 cards.
 */
export function prizeRisk(
  deckCards: { cardId: string; name: string; quantity: number }[],
  deckSize = 60,
  prizeCount = 6
): PrizeRisk[] {
  return deckCards.map((card) => {
    // P(none prized) = C(60-qty, 6) / C(60, 6)
    const probNonePrized = hypergeometricPMF(deckSize, card.quantity, prizeCount, 0);
    const probAtLeastOnePrized = 1 - probNonePrized;

    // P(all prized) — only meaningful for 1-2 copy cards
    const probAllPrized = card.quantity <= prizeCount
      ? hypergeometricPMF(deckSize, card.quantity, prizeCount, card.quantity)
      : 0;

    const riskLevel = ((): PrizeRisk['riskLevel'] => {
      if (probAllPrized > 0.02) return 'critical';   // > 2% chance of total loss
      if (probAtLeastOnePrized > 0.5) return 'high';  // > 50% chance of losing a copy
      if (probAtLeastOnePrized > 0.25) return 'medium';
      return 'low';
    })();

    return { ...card, probAtLeastOnePrized, probAllPrized, riskLevel };
  });
}
```

#### 1d. `energy-curve.ts` — Energy Curve Validation

```typescript
// apps/web/src/web/lib/deck-math/energy-curve.ts

export interface EnergyCurveResult {
  totalEnergy: number;
  basicEnergy: number;
  specialEnergy: number;
  energyRatio: number;           // totalEnergy / 60
  assessedAttachPerTurn: number; // estimated energy available by turn N using ratio
  recommendation: EnergyRecommendation;
  turnCurve: number[];           // [turn1, turn2, turn3, turn4, turn5] expected energy attached
}

export type EnergyRecommendation =
  | 'too-few'     // < 8 total
  | 'lean'        // 8-10 total
  | 'standard'    // 11-14 total (most decks)
  | 'heavy'       // 15-18 total
  | 'too-many';   // > 18 total

export interface CardSummary {
  supertype: 'Pokémon' | 'Trainer' | 'Energy';
  subtypes?: string[];
  quantity: number;
}

/**
 * Analyze energy distribution in a deck.
 * Classifies energy cards by supertype and computes the expected
 * energy attachment curve over 5 turns.
 */
export function energyCurveAnalysis(deckCards: CardSummary[], deckSize = 60): EnergyCurveResult {
  const energyCards = deckCards.filter((c) => c.supertype === 'Energy');
  const totalEnergy = energyCards.reduce((acc, c) => acc + c.quantity, 0);

  const basicEnergy = energyCards
    .filter((c) => !c.subtypes?.includes('Special'))
    .reduce((acc, c) => acc + c.quantity, 0);

  const specialEnergy = totalEnergy - basicEnergy;
  const energyRatio = totalEnergy / deckSize;

  // Expected energy in hand by turn N:
  // Turn T: player has seen (7 + T) cards. Expected energy = (7 + T) * energyRatio
  // Subtract 1 for energy already attached (simplified model)
  const turnCurve = [1, 2, 3, 4, 5].map((t) => {
    const cardsDrawn = 7 + t;
    const expectedInHand = cardsDrawn * energyRatio;
    return Math.min(totalEnergy, Math.max(0, expectedInHand - t));
  });

  const recommendation = ((): EnergyRecommendation => {
    if (totalEnergy < 8) return 'too-few';
    if (totalEnergy <= 10) return 'lean';
    if (totalEnergy <= 14) return 'standard';
    if (totalEnergy <= 18) return 'heavy';
    return 'too-many';
  })();

  return {
    totalEnergy,
    basicEnergy,
    specialEnergy,
    energyRatio,
    assessedAttachPerTurn: energyRatio,
    recommendation,
    turnCurve,
  };
}
```

### 2. REST Endpoint: Deck Analytics

```typescript
// apps/rest-api/src/handlers/deck-analytics.ts
// GET /api/v1/decks/:id/analytics
// Returns: { deckId, openingHand, prizeRisk, energyCurve }
// The heavy math runs client-side via deck-math lib; this endpoint
// just returns the structured card list needed as input.
// Alternatively: thin passthrough — frontend calls deck detail then computes locally.
```

**Decision**: Run all calculations client-side. The frontend already fetches deck detail (60 cards).
The `deck-math` functions are pure and fast (< 1ms for 60 cards). No backend endpoint is needed
for analytics computation. The analytics page fetches the deck via existing `GET /api/v1/decks/:id`
and runs the math in the component.

### 3. DeckAnalyticsPage

New route: `GET /decks/:deckId/analytics`

```typescript
// apps/web/src/web/pages/DeckAnalyticsPage/DeckAnalyticsPage.tsx

export function DeckAnalyticsPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const { data: deck, isLoading } = useDeckQuery(deckId!);

  if (isLoading) return <LoadingSpinner />;
  if (!deck) return <NotFoundPage />;

  const flatCards = deck.cards.flatMap((dc) =>
    Array.from({ length: 1 }, () => ({ ...dc.card, quantity: dc.quantity }))
  );

  const openingHand = openingHandProbabilities(flatCards);
  const prizes = prizeRisk(flatCards);
  const energy = energyCurveAnalysis(flatCards.map((c) => ({ supertype: c.supertype, subtypes: c.subtypes, quantity: c.quantity })));

  return (
    <div className="deck-analytics">
      <header className="deck-analytics__header">
        <h1 className="deck-analytics__title">{deck.name} — Analytics</h1>
        <Link to={ROUTES.DECK_DETAIL(deckId!)} className="deck-analytics__back">
          ← Back to Deck
        </Link>
      </header>
      <div className="deck-analytics__grid">
        <OpeningHandPanel data={openingHand} />
        <PrizeRiskPanel data={prizes} />
        <EnergyCurvePanel data={energy} />
        <ConsistencyPanel cards={flatCards} />
      </div>
    </div>
  );
}
```

### 4. Panel Components

#### OpeningHandPanel

```typescript
// Renders a table of all unique cards (by name), sorted by probability descending.
// Columns: Card Name | Copies | P(≥1) | P(≥2) | Bar
// "Bar" column is a CSS progress bar from 0-100% width
// Hand size slider: 5 / 6 / 7 / 8 (for draws + supporter effects)
```

#### PrizeRiskPanel

```typescript
// Focus on high-risk cards: show only cards with riskLevel 'medium' | 'high' | 'critical'
// Color-coded rows: critical=red, high=amber, medium=yellow
// Each row: Card Name | Copies | P(Prized) | Risk Badge
// Callout: "Cards with 1 copy have a X% chance of being prized"
```

#### EnergyCurvePanel

```typescript
// Bar chart (CSS bars, no charting library) showing expected energy attached per turn
// Recommendation badge (too-few | lean | standard | heavy | too-many)
// Summary: Total Energy: N | Basic: N | Special: N | Ratio: N%
```

#### ConsistencyPanel

```typescript
// Combo builder: user selects 2-3 cards from the deck via dropdown
// Shows P(having all selected cards by turn 2) = comboConsistency(...)
// Default combo: the two highest-quantity non-energy cards
```

### 5. Navigation Integration

Add "Analytics" link/button to `DeckDetailPage`:

```typescript
// DeckDetailPage.tsx — add to deck action bar:
<Link to={`/decks/${deckId}/analytics`} className="button button--secondary">
  View Analytics
</Link>
```

---

## File Structure

```
apps/web/src/web/lib/deck-math/
├── index.ts                         # re-exports all public functions
├── hypergeometric.ts
├── opening-hand.ts
├── prize-risk.ts
└── energy-curve.ts

apps/web/src/web/lib/deck-math/__tests__/
├── hypergeometric.test.ts
├── opening-hand.test.ts
├── prize-risk.test.ts
└── energy-curve.test.ts

apps/web/src/web/pages/DeckAnalyticsPage/
├── index.ts
├── DeckAnalyticsPage.tsx
└── DeckAnalyticsPage.css

apps/web/src/web/components/DeckAnalyticsPanel/
├── OpeningHandPanel.tsx
├── PrizeRiskPanel.tsx
├── EnergyCurvePanel.tsx
├── ConsistencyPanel.tsx
└── DeckAnalyticsPanel.css

apps/web/src/web/routes/
└── routes.tsx                        # MODIFIED — add /decks/:id/analytics route
```

---

## Acceptance Criteria

- [ ] `hypergeometricPMF(60, 4, 7, 0)` returns `≈ 0.6097` (±0.001)
- [ ] `hypergeometricCDF(60, 4, 7, 1)` returns `≈ 0.3903` (±0.001) — P(drawing ≥1 of 4 copies in 7)
- [ ] `prizeRisk` for a 4-copy card returns `probAtLeastOnePrized ≈ 0.3573` (±0.001)
- [ ] `prizeRisk` for a 1-copy card returns `riskLevel === 'high'`
- [ ] `energyCurveAnalysis` for a deck with 12 basic energy returns `recommendation === 'standard'`
- [ ] All deck-math unit tests pass: `cd apps/web && bun test lib/deck-math`
- [ ] `DeckAnalyticsPage` renders at `/decks/:id/analytics` for a valid deck ID
- [ ] Opening hand panel renders all unique cards sorted by probability
- [ ] Prize risk panel highlights cards with riskLevel 'high' or 'critical' in amber/red
- [ ] Energy curve panel renders 5-turn bar chart
- [ ] Consistency panel combo selector shows correct probability after card selection
- [ ] "View Analytics" link renders on `DeckDetailPage`
- [ ] No TypeScript errors introduced

---

## Dependencies

- SPEC_01 (routing structure)
- Existing `GET /api/v1/decks/:id` endpoint (returns hydrated card list — already built)

---

## Verification

```bash
# Run deck-math unit tests
cd apps/web && bun test lib/deck-math

# Validate specific calculation
bun -e "
import { hypergeometricCDF } from './src/web/lib/deck-math/opening-hand';
const p = hypergeometricCDF(60, 4, 7, 1);
console.assert(Math.abs(p - 0.3903) < 0.001, 'P(≥1 of 4 in hand of 7) wrong: ' + p);
console.log('PASS: p =', p.toFixed(4));
"

# Type check
cd apps/web && bun run check-types
```
