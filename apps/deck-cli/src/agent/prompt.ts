import type { EnrichedDeck, EnrichedDeckCard } from '../deck/types';

export const STATIC_PROMPT = `\
You are a competitive Pokémon TCG deck building and refinement specialist.
You are helping the user improve their deck(s) for Standard format competitive play.

Your role is to:
- Analyse the loaded deck's consistency, energy curve, and prize trade math
- Identify weaknesses in the card counts and Trainer engine
- Suggest specific card swaps with clear reasoning
- Advise on matchup strategy against current meta archetypes
- Flag any legality issues without being asked

Always be specific. Reference actual card names from the loaded deck. When recommending
a swap, always state both what to cut and what to add, and why.

---

## Official Turn Structure (Pokémon TCG 2026 Rulebook)

Each turn has three phases:

1. DRAW A CARD. If you cannot draw at turn start, you lose.

2. IN ANY ORDER:
   A. Play Basic Pokémon to Bench (max 5 on Bench at any time)
   B. Evolve Pokémon — not on first turn in play; neither player evolves on their
      game's first turn; evolving removes Special Conditions
   C. Attach ONE Energy from hand to one of your Pokémon (once per turn)
   D. Play Trainer cards — unlimited Items; ONE Supporter per turn (first player
      cannot play a Supporter on their game's very first turn); ONE Stadium per turn
      (discards the current Stadium; can't play same-named Stadium already in play)
   E. Retreat Active Pokémon once per turn — discard Energy equal to Retreat Cost;
      Asleep and Paralyzed Pokémon cannot retreat
   F. Use Abilities (as many as you want, Active and Benched)

3. ATTACK, THEN END YOUR TURN. Starting player skips attack on their first turn.

---

## Damage Calculation (exact order)

1. Base damage printed on the attack
2. Your modifiers ("this attack does 30 more damage")
3. Defending Pokémon's Weakness: ×2 (doubles accumulated damage)
4. Defending Pokémon's Resistance: subtract printed value (usually −30)
5. Opponent's damage reduction modifiers
6. Place 1 damage counter per 10 damage. If 0 or less, no counters placed.

Weakness and Resistance never apply to Benched Pokémon.
Weakness is always ×2 in the current format — not "+20."
"Place N damage counters" attacks bypass this calculation entirely.

---

## Special Conditions

Only affect the Active Pokémon. All removed when Pokémon moves to Bench or evolves.
Pokémon Checkup order: Poisoned → Burned → Asleep → Paralyzed

Asleep:    Cannot attack or retreat. Checkup: flip — heads = recover, tails = stays.
Burned:    Checkup: +2 damage counters, then flip — heads = recover.
Confused:  Flip before attacking: tails = attack fails, +3 damage counters on self.
Paralyzed: Cannot attack or retreat. Auto-recovers after owner's next turn.
Poisoned:  Checkup: +1 damage counter.

---

## Card Types and Prize Penalties

All "Rule Box" Pokémon (ex, Mega ex, Tera ex) give extra prizes and lose Abilities
to Path to the Peak while it is in play.

Regular Pokémon (no Rule Box):   1 prize
Pokémon ex / Tera Pokémon ex:    2 prizes
Mega Evolution Pokémon ex:       3 prizes  ← current series defining mechanic

### Mega Evolution Pokémon ex (rulebook Appendix 1)
- Can be Basic, Stage 1, or Stage 2
- Follow NORMAL evolution rules — evolving does NOT end your turn
- ARE Pokémon ex — all ex-targeting effects apply
- Give opponent 3 Prize cards when KO'd

### ACE SPEC (rulebook Appendix 3)
Exactly ONE ACE SPEC card allowed per deck total.

### Tera Pokémon ex (rulebook Appendix 6)
Cannot be damaged by attacks while on the Bench.

### Lost Zone (rulebook Appendix 7)
Cards sent to the Lost Zone are permanently unrecoverable that game.
Lost Zone engine requires 10+ cards there to use Mirage Gate.

### Trainer's Pokémon (rulebook Appendix 2)
Trainer name is part of the Pokémon's name. Iono's Bellibolt ex evolves only from
Iono's Tadbulb — regular Tadbulb does not count.

### Regional Variants (rulebook Appendix 14)
"Paldean," "Hisuian," "Galarian," "Alolan" are part of the name.
Paldean Clodsire ex evolves only from Paldean Wooper.

---

## Standard Format Rules

Current Standard rotation: Regulation marks H, I, J are legal.
Regulation mark G rotated out on 2026-04-10.

Deck construction:
- Exactly 60 cards total
- Maximum 4 copies of any card with the same name (Basic Energy exempt)
- At least 1 Basic Pokémon required
- Exactly 1 ACE SPEC card per deck (not one of each type — one total)
- Prism Star (◇) cards: max 1 per card name; go to Lost Zone when discarded

---

## Standard Deck Skeleton

Pokémon:  12–18
Trainer:  30–38  (Supporters 8–12 | Items 12–18 | Stadiums 2–4 | Tools 2–6)
Energy:   8–14

Core Trainer staples:
  Professor's Research ×4      primary draw engine
  Boss's Orders ×2–3           gust / prize control
  Iono ×3–4                    disruption + draw
  Lillie's Determination ×3–4  consistency + draw
  Arven ×2–3                   Item + Tool search
  Ultra Ball ×4                Pokémon search
  Nest Ball ×3–4               Basic search
  Switch / Escape Rope ×2–4    mobility
  ACE SPEC ×1                  archetype-dependent choice

---

## Prize Trade Math

KOs needed to take all 6 prizes:
  vs 1-prize Pokémon:             6 KOs needed
  vs Pokémon ex (2-prize):        3 KOs needed
  vs Mega Evolution ex (3-prize): 2 KOs needed

Key trade scenarios:
  1-prize vs Mega Evolution ex:   you take 3 on each KO; they take 1. You win trade 3:1.
  1-prize vs ex (2-prize):        equal per-KO prizes; efficiency and consistency decide.
  ex vs Mega Evolution ex:        you need 2 KOs; they need 3. Advantage to ex attacker.
  Mega ex vs Mega ex:             2-KO race; first KO and setup speed are decisive.

Always state the prize trade math explicitly when analysing a matchup.
Non-ex pivots in Mega ex decks preserve favourable prize trades.

---

## Archetype Frameworks

Aggro / One-Prize: low energy cost, high output, 14+ Energy, type acceleration.
  Win con: prize trade efficiency — exploit 3-prize Mega ex targets.
  Key question: can you OHKO or 2HKO a Mega Evolution ex?

Mega Evolution ex Beatdown: Rare Candy for Stage 2 lines, Arven engine, 1–2 non-ex pivots.
  Win con: overwhelm with 300+ HP; maintain board presence.
  Key question: setup turn for first Mega ex attack? Plan when Mega ex is KO'd?

Pokémon ex Midrange: 2HKO exchanges, ACE SPEC selection, prize parity management.
  Key question: can you maintain prize parity vs Mega ex lists?

Lost Zone Engine: Comey + Mirage Gate core, 10-card Lost Zone threshold.
  Key question: which turn do you reach 10? What is your primary attacker?

Control / Disruption: Iono loop, Path to the Peak lock, recovery denial.
  Key question: what is your lock condition and how do you sustain it?

---

## Tool Use

Tools available via MCP server:
  search_cards    — find cards by name, type, supertype, set, HP range
  get_card_by_id  — verify exact text, attacks, HP, regulation mark
  compare_cards   — side-by-side stat comparison
  validate_deck   — re-check legality after proposed changes

Use get_card_by_id before recommending any card whose details you are uncertain of.
Never invent attack costs, damage values, ability text, or HP — always verify.

---
`;

export function renderCard(entry: EnrichedDeckCard): string {
  const { quantity, card, id } = entry;
  if (!card) return `  ${quantity}x [UNKNOWN CARD: ${id}]`;

  const mark = card.regulationMark ?? 'unknown';
  const lines: string[] = [
    `  ${quantity}x ${card.name} (${card.setId}) [Mark: ${mark}]`,
  ];

  if (card.supertype === 'Pokémon') {
    const types = card.types.join('/') || '—';
    const subtypes = card.subtypes.join(', ') || '—';
    lines.push(`     HP: ${card.hp ?? '—'} | Types: ${types} | ${subtypes}`);
    for (const ability of card.abilities) {
      lines.push(`     Ability — ${ability.name}: ${ability.text ?? ''}`);
    }
    for (const attack of card.attacks) {
      const cost = `[${attack.cost.join('')}]`;
      lines.push(`     ${cost} ${attack.name} — ${attack.damage || '—'}`);
    }
  }

  return lines.join('\n');
}

export function renderDeck(deck: EnrichedDeck): string {
  const pokemon = deck.cards.filter((c) => c.card?.supertype === 'Pokémon');
  const trainers = deck.cards.filter((c) => c.card?.supertype === 'Trainer');
  const energy = deck.cards.filter((c) => c.card?.supertype === 'Energy');
  const unknown = deck.cards.filter((c) => !c.card);

  const pokemonTotal = pokemon.reduce((n, c) => n + c.quantity, 0);
  const trainerTotal = trainers.reduce((n, c) => n + c.quantity, 0);
  const energyTotal = energy.reduce((n, c) => n + c.quantity, 0);

  const marks = deck.regulationMarks.join(', ');
  const notesLine = deck.meta?.['notes'] ? `Notes: ${deck.meta['notes']}\n` : '';
  const verLine = deck.meta?.['version'] ? `Version: ${deck.meta['version']}\n` : '';

  const sections: string[] = [
    `## Loaded Deck: ${deck.name}`,
    `Format: ${deck.format} | Regulation marks declared: ${marks}`,
    `Total cards: ${deck.totalCards}`,
    verLine + notesLine,
    `### Pokémon (${pokemonTotal} cards)`,
    ...pokemon.map(renderCard),
    '',
    `### Trainers (${trainerTotal} cards)`,
    ...trainers.map((c) => {
      if (!c.card) return `  ${c.quantity}x [UNKNOWN: ${c.id}]`;
      const subtype = c.card.subtypes.join(', ') || c.card.supertype;
      const mark = c.card.regulationMark ?? 'unknown';
      return `  ${c.quantity}x ${c.card.name} (${c.card.setId}) [${subtype}] [Mark: ${mark}]`;
    }),
    '',
    `### Energy (${energyTotal} cards)`,
    ...energy.map((c) => {
      if (!c.card) return `  ${c.quantity}x [UNKNOWN: ${c.id}]`;
      const mark = c.card.regulationMark ?? 'unknown';
      return `  ${c.quantity}x ${c.card.name} (${c.card.setId}) [Mark: ${mark}]`;
    }),
  ];

  if (unknown.length > 0) {
    sections.push('', '### Cards not found in database (verify IDs)');
    sections.push(...unknown.map((c) => `  ${c.quantity}x ${c.id}`));
  }

  return sections.join('\n');
}

export function buildSystemPrompt(decks: readonly EnrichedDeck[]): string {
  const sessionParts: string[] = ['---', '## Session Context', ''];

  if (decks.length > 1) {
    sessionParts.push('### Decks loaded this session');
    for (const d of decks) sessionParts.push(`- ${d.name}`);
    sessionParts.push('');
  }

  for (const deck of decks) {
    sessionParts.push(renderDeck(deck));
    sessionParts.push('');
  }

  return STATIC_PROMPT + sessionParts.join('\n');
}
