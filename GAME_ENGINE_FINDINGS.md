# Game Engine Spec Audit

## Pass 1

---

  CRITICAL — Rules incorrectly specified

  1. Mulligan extra draw calculation is wrong (SPEC_02)

  The spec says:
  ▎ "For each mulligan the opponent took beyond the first that you did not also take, you may draw 1 extra card"
  ▎ "Example: Player A took 0 mulligans, Player B took 3. Player A may draw up to 3 extra cards."

  The rulebook (p.18) says:
  ▎ "the player who did not have to start over may draw a card for each extra mulligan their opponent took. For example, if both players took 2 mulligans, and then Player A took 3 additional
  mulligans, Player B may draw up to 3 cards."

  The spec's "beyond the first" phrasing is wrong. The rulebook counts extra mulligans — the differential between the two players' mulligan counts, not "beyond the first." If Player A takes 3 and
  Player B takes 0, Player B draws up to 3 (not 2). The example happens to be correct, but the rule statement is misleading and would produce wrong results in mutual-mulligan scenarios.

  1. Paralyzed removal timing is wrong (SPEC_02)

  The spec says:
  ▎ "4. Paralyzed: If it was the owner's turn, remove Paralyzed"

  The rulebook (p.16) says:
  ▎ "If a Pokémon is Paralyzed, it cannot attack or retreat. After its owner's next turn, it recovers during Pokémon Checkup."

  This means Paralyzed is removed during the Checkup after the owner's turn, not "if it was the owner's turn." The spec's phrasing is ambiguous about which Checkup removes it. Paralyzed lasts through
  the owner's turn and is removed in the Checkup that follows. Since Checkup happens between turns (after the current player's turn ends), Paralyzed should be removed when the Checkup is processing
  after the Paralyzed Pokemon's owner just had their turn.

  1. Tera Pokémon ex bench protection is missing (SPEC_01, SPEC_03)

  The rulebook (Appendix 6, p.27) states:
  ▎ "Tera Pokémon ex have a crystalline appearance and a new effect that prevents all attack damage done to them while they're on your Bench, both yours and your opponent's."

  The spec has 'Tera' as a PokemonSubtype but never specifies the bench damage immunity rule. SPEC_03's dealBenchDamage function would incorrectly damage Tera ex on the bench. This needs to be a
  hard-coded rule check in the damage pipeline, not a per-card effect.

  1. Mega Evolution ex has NO "end turn" rule — spec implies otherwise (SPEC_01, OVERVIEW)

  The spec (OVERVIEW) explicitly lists Mega Evolution ex with 3 prize value and as a PokemonStage: 'MegaEvolutionEx'. The rulebook (Appendix 1, p.23) says for the new Mega Evolution series:
  ▎ "there are no special rules when it comes to playing Mega Evolution Pokémon ex. Mega Evolution Pokémon ex can appear as Basic, Stage 1, or Stage 2 Pokémon, and they follow the normal rules of
  Evolution"

  This means MegaEvolutionEx should NOT be a separate PokemonStage. A Mega Evolution ex is a Basic, Stage 1, or Stage 2 — it just has the Mega Evolution ex subtype. The current type system would make
  the engine unable to determine if a Mega Kangaskhan ex (Basic) can be played directly or if a Mega Gardevoir ex (Stage 2) needs to evolve from Kirlia. The stage field should reflect the actual
  printed stage (Basic/Stage1/Stage2), and MegaEvolutionEx should remain only as a PokemonSubtype.

  1. Special Conditions: mutual exclusivity rules are missing (SPEC_01, SPEC_02)

  The rulebook (p.16) specifies:
  ▎ "Asleep, Confused, and Paralyzed all rotate the Pokémon card, whichever one happened last to the Pokémon is the only one that is still in effect. Since Poisoned and Burned use markers, those don't
   affect other Special Conditions."

  The spec stores specialConditions: ReadonlyArray<SpecialCondition> but never documents the replacement rule: Asleep, Confused, and Paralyzed are mutually exclusive — applying one removes the others.
   A Pokemon CAN be simultaneously Burned + Poisoned + one of {Asleep, Confused, Paralyzed}. The applySpecialCondition function needs this logic.

  ---
  HIGH — Missing rules that will produce incorrect simulations

  1. Special Conditions are removed when moving to bench (SPEC_02, SPEC_03)

  The rulebook (p.15) says:
  ▎ "when a Pokémon goes to the Bench, it recovers from all Special Conditions"

  And (p.12):
  ▎ "When your Active Pokémon goes to your Bench (whether it retreated or got there some other way), some things do away—Special Conditions and any effects from attacks."

  The spec mentions evolution clears Special Conditions (SPEC_02 §6) but doesn't explicitly require that retreat and Switch effects clear all Special Conditions and attack effects from the Pokemon.
  The RETREAT action handler and switchActive primitive must clear conditions.

  1. Damage pipeline step 2 — "stop if base damage is 0" rule missing (SPEC_03)

  The rulebook (p.20, step 2) says:
  ▎ "Stop if the base damage is 0 (or if the attack does not do any damage at all)."

  If an attack's base damage is 0 and there's no +/x/- modifier, the entire damage calculation pipeline (weakness, resistance, effects) should be skipped. The spec's pipeline doesn't account for this
  — it would apply weakness/resistance to 0-damage attacks that have effect-based damage (like "place damage counters"), which would be wrong. Placing damage counters ≠ dealing damage; counters bypass
   the pipeline entirely (rulebook p.20 step 1).

  1. "Place damage counters" vs "deal damage" distinction not codified (SPEC_03)

  The rulebook (p.20) explicitly distinguishes:
  ▎ "If an attack tells you to place damage counters on a Pokémon, you have no more calculations to do because damage counters aren't affected by Weakness, Resistance, or any other effects on a
  Pokémon."

  The spec's damage pipeline conflates these. Effects that "place damage counters" (e.g., Poison, Burn, Confused self-damage, certain attacks) skip the entire calculation pipeline. This distinction
  needs to be a first-class concept in the combat system, not just an implicit convention in effect handlers.

  1. "Up to" vs "any amount" semantics missing (SPEC_04)

  The rulebook (p.21) specifies:
  ▎ For attacks: "up to X" = choose between 0 and X.
  ▎ For Trainer/Ability effects: "up to X" = choose between 1 and X.
  ▎ "Any amount" = you can choose 0.
  ▎ Exception: search effects that don't specify a kind require choosing at least 1.

  None of this is codified in the effect system. The AI choice resolution and effect primitives need these constraints.

  1. Card draw when deck has fewer cards than requested (SPEC_04)

  The rulebook (p.21):
  ▎ "If a card tells you to draw or look at more cards from your deck than you have left, draw or look at the cards you have and continue play as normal."
  ▎ "You lose if you cannot draw a card at the beginning of your turn, but not if you cannot draw one because a card told you to do so."

  The drawCards primitive in SPEC_04 doesn't specify this behavior — drawing from an empty deck via a card effect should NOT trigger the deck-out loss condition. Only the mandatory turn-start draw
  triggers it.

  1. Coin flip for who goes first — winner DECIDES, doesn't automatically go first (SPEC_02)

  The rulebook (p.8):
  ▎ "The winner of the coin flip decides which player goes first."

  The spec setup says "Coin flip → determine who goes first" but the COIN_FLIP_CHOICE action in SPEC_01 says "when player chooses flip outcome (going first/second)." This is subtly correct in the
  action type but the setup procedure text is misleading — the winner chooses, they don't automatically go first. For simulation the AI always chooses first (which is correct per SPEC_05), but the
  spec text should be precise.

  1. Technical Machine trainer subtype has no play rules (SPEC_01, SPEC_02)

  TrainerSubtype includes 'TechnicalMachine' but no play rules are specified anywhere. Technical Machines attach to Pokemon (like Tools) and grant an extra attack. The spec needs to either:

- Define TM play/attach rules and how the granted attack interacts with combat
- Or explicitly defer TMs to v2

  1. ACE SPEC cards can be both Trainer Items AND Special Energy (SPEC_01)

  The spec's TrainerSubtype includes 'AceSpec' but the rulebook (Appendix 3, p.25) shows ACE SPEC can also be Special Energy (e.g., "Neo Upper Energy"). The deck validation's "max 1 ACE SPEC" check
  needs to span both Trainer and Energy cards. The EnergyCardDefinition type has no way to indicate ACE SPEC status.

  ---
  MEDIUM — Gaps that affect correctness in edge cases

  1. Stadium ownership tracking is contradictory (SPEC_01)

  PlayerState has stadium: string | null with comment "tracked per player who played it", but GameState also has stadium: string | null described as "shared zone." Only one of these should be
  authoritative. The rulebook says only one Stadium can be in play at a time (shared). The engine needs one canonical location plus a playedBy field to enforce "can't play Stadium with same name as
  one already in play" and "can't discard your own Stadium by playing a new one of the same name" (p.12).

  1. Retreat clears attack effects on the retreating Pokemon (SPEC_02)

  The rulebook (p.12):
  ▎ "When your Active Pokémon goes to your Bench... Special Conditions and any effects from attacks go away."

  The TemporalEffect system in SPEC_04 doesn't distinguish between effects FROM attacks vs effects from other sources. When a Pokemon moves to bench, only attack-originated temporal effects targeting
  it should be cleared. This needs a source_type field on TemporalEffect.

  1. Pre-attack effects check if Active has changed (SPEC_03)

  The rulebook (p.20, step B):
  ▎ "if an Active Pokémon has changed since your opponent used the attack in this example, you don't have to flip a coin."

  Effects like Sand Attack that trigger "if the Defending Pokemon tries to attack" must track which specific Pokemon was the "Defending Pokemon" at the time. If the Active has changed (retreat, KO +
  promote), the effect no longer applies. The TemporalEffect type needs to track the original target's identity.

  1. Professor's Research is listed as both Item and Supporter (SPEC_04)

  In the priority cards list, "Professor's Research — Discard hand, draw 7" appears under both Trainer Items and Trainer Supporters. It's a Supporter. Remove it from the Items list.

  1. First turn restrictions: the spec is incomplete on what "first turn" means

  The spec says first player can't attack on turn 1 and can't play Supporter on turn 1. The rulebook (p.12-13) is clear that these restrictions apply only to the player who goes first on their first
  turn — the second player CAN play Supporters and attack on their first turn. The spec's firstTurn boolean on GameState and firstPlayerFirstTurn on TurnFlags are redundant and confusing. A single
  isFirstTurnOfGame flag plus checking activePlayer === startingPlayer would be clearer and less error-prone.

  1. Evolution: evolvesFrom matches on Pokemon NAME, not card ID (SPEC_02)

  The spec correctly says evolvesFrom must match the name of the Pokemon being evolved, but doesn't address the subtlety from p.21:
  ▎ Regional variants (Paldean, Hisuian, Galarian, Alolan) are part of the name. "Paldean Clodsire ex" evolves from "Paldean Wooper," NOT "Wooper."
  ▎ Trainer's Pokemon: "Iono's Bellibolt ex" evolves from "Iono's Tadbulb," NOT "Tadbulb."

  The evolvesFrom string comparison needs to be exact name match. The spec should explicitly state this to prevent a developer from implementing fuzzy/substring matching.

  1. Benched Pokemon KO handling incomplete (SPEC_03)

  The checkKnockOuts function checks "any Pokemon in play" but doesn't specify ordering for multiple simultaneous KOs. If both the Active and a Benched Pokemon are KO'd in the same attack:

- Both go to discard
- Prize cards are awarded for each
- Only then does the player promote

  The spec should clarify that ALL KOs from a single attack are processed before any promotion occurs, and prizes from all KOs are cumulative (could win mid-processing).

  ---
  LOW — Completeness and consistency issues

  1. resistances JSON value format

  SPEC_01 shows WeaknessDefinition.value as "x2", "+20". The SQLite data stores weakness as "×2" (multiplication sign ×, Unicode U+00D7), not "x2" (letter x). The adapter's parsing logic needs to
  handle both.

  1. AbilityDefinition.type includes legacy types not in Standard

  The type includes 'PokemonPower' | 'PokeBody' | 'PokePower' which are not present on any Standard-legal card (G/H/I/J). Since the engine is Standard-only, these are unnecessary. Not harmful, but
  adds dead code paths.

  1. No TOOL_ATTACHED event type

  There's an ENERGY_ATTACHED event but no corresponding event for Pokemon Tool attachment. Tool attachment is a distinct game action that should be logged for replay fidelity.

  1. DeckInput.cards doesn't distinguish same-name different-ID cards

  A deck can have 4 copies of "Nest Ball" from different sets (different card IDs). The DeckInput uses cardId (set-specific). The 4-copy limit is per name, not per ID. Deck validation needs to
  aggregate by name, but the input format is by ID — this works but should be explicitly documented to prevent confusion.

  1. Missing event: CARD_RETURNED_TO_DECK / CARD_RETURNED_TO_HAND

  Effects like Super Rod (shuffle cards from discard into deck) and Energy Retrieval (return cards from discard to hand) don't have specific event types. CARD_MOVED covers it generically, but
  dedicated events would improve analysis.

  1. lostZone is included "for forward compat" but Lost Zone is deferred to v2

  This is fine as-is, but if any Standard-legal cards reference Lost Zone (and some do — Comfey, Sableye from regulation G), the engine will silently ignore those effects. Should be noted in the
  fallback behavior section.

  ---
  Summary

  ┌──────────┬───────┬──────────────────────────────────────────────────────────────────────┐
  │ Severity │ Count │                           Action Required                            │
  ├──────────┼───────┼──────────────────────────────────────────────────────────────────────┤
  │ Critical │ 5     │ Must fix before implementation — would produce incorrect game states │
  ├──────────┼───────┼──────────────────────────────────────────────────────────────────────┤
  │ High     │ 8     │ Must fix before simulation results are meaningful                    │
  ├──────────┼───────┼──────────────────────────────────────────────────────────────────────┤
  │ Medium   │ 7     │ Fix before v1 release; can implement with TODOs initially            │
  ├──────────┼───────┼──────────────────────────────────────────────────────────────────────┤
  │ Low      │ 6     │ Nice-to-have; address during implementation                          │
  └──────────┴───────┴──────────────────────────────────────────────────────────────────────┘

  The most impactful fixes are: #4 (MegaEvolutionEx stage modeling), #5 (special condition mutual exclusivity), #3 (Tera bench protection), #7-8 (damage counters vs damage distinction), and #13 (ACE
  SPEC on Energy cards). These would all produce silently wrong simulations if implemented as-written.

---

### Fix

  All 26 fixes are applied across all 6 spec files. Here's a summary:

  ---
  SPEC_01 (Core Types) — 12 changes:

- PokemonStage no longer includes MegaEvolutionEx (#4)
- AbilityDefinition.type simplified to 'Ability' only (#22)
- WeaknessDefinition.value documents Unicode normalization (#21)
- EnergyCardDefinition gains isAceSpec field (#13)
- Special Condition mutual exclusivity rules documented (#5)
- Bench-to-zone removal rules documented (#6)
- PlayerState.stadium removed — consolidated to GameState.stadium: StadiumState (#14)
- GameState gains startingPlayer, temporalEffects fields; firstTurn replaced by TurnFlags.isStartingPlayerFirstTurn (#18)
- COIN_FLIP_CHOICE changed to first | second (#11)
- ATTACH_TOOL action added (#12)
- TOOL_ATTACHED and DAMAGE_COUNTERS_PLACED events added (#23, #8, #25)
- Technical Machine rules documented (#12)
- Adapter: weakness normalization, ACE SPEC energy detection documented (#21, #13)

  SPEC_02 (Game Flow) — 8 changes:

- Mulligan extra draw = differential, not "beyond the first" (#1)
- Coin flip winner decides who goes first (#11)
- Paralyzed removal: after owner's turn, not "if it was owner's turn" (#2)
- Poison/Burn use counter placement, not damage pipeline (#7, #8)
- Retreat clears all Special Conditions + attack effects (#6)
- First-turn restrictions clarified for starting vs second player (#18)
- Evolution name matching is exact (regional variants, Trainer's Pokemon) (#19)
- ACE SPEC validation spans Trainer + Energy (#13)

  SPEC_03 (Combat) — 7 changes:

- Pipeline stops at 0 base damage (#7)
- "Place damage counters" vs "deal damage" distinction (#8)
- Tera ex bench damage immunity (#3)
- Pre-attack effects track original target identity (#16)
- KO ordering: all KOs processed before promotion, prizes cumulative (#20)
- Section renumbered for new §9

  SPEC_04 (Card Effects) — 8 changes:

- applySpecialCondition enforces mutual exclusivity (#5)
- drawCards handles empty deck gracefully (#10)
- switchActive clears conditions on benched Pokemon (#6)
- "Up to" vs "any amount" semantics documented (#9)
- TemporalEffect gains sourceType and originalTarget (#15, #16)
- Cleanup rules for TemporalEffects on bench/evolve documented (#15)
- Professor's Research removed from Items list (#17)
- Lost Zone fallback behavior documented (#26)

  SPEC_06 (Simulation) — 1 change:

- DeckInput documents that 4-copy limit is per name, not per cardId (#24)

  OVERVIEW — 1 change:

- Updated scope to reflect TM support, Mega Evolution stage fix, ACE SPEC on Energy, Tera bench immunity

---

## Pass 2

---
 ---
  Second Pass Findings

  1. CRITICAL — PlayerAction union has TypeScript syntax error (SPEC_01)

  Lines 272-273 have semicolons terminating each union branch, which breaks the union. The ; after COIN_FLIP_CHOICE closes the type declaration, making ATTACH_TOOL an orphan.

  1. HIGH — Evolution "first turn" rule is imprecise (SPEC_02)

  The validation table says "not first turn of game" for EVOLVE_POKEMON. The rulebook p.11 says "neither player can evolve a Pokémon on that player's first turn." This means:

- Turn 1 (P1's turn): P1 can't evolve
- Turn 2 (P2's turn): P2 can't evolve

  "Not first turn of game" reads as "turnNumber !== 1" which would incorrectly allow P2 to evolve on turn 2 (their first turn).

  1. HIGH — Rare Candy exception to evolution chain is unspecified (SPEC_02/SPEC_04)

  SPEC_02 §6 says "Basic -> Stage 1 -> Stage 2 (must follow chain)." But Rare Candy (listed in SPEC_04 as a priority effect) allows evolving Basic directly to Stage 2, bypassing Stage 1. The evolution
   rules need to accommodate this card-effect-driven exception.

  1. MEDIUM — Damage pipeline visualization is outdated (SPEC_03)

  The ASCII art (lines 259-306) doesn't reflect the updated pipeline: no "stop at 0" check, no "place counters vs deal damage" fork at the top, no Tera bench immunity check.

  1. MEDIUM — Dual-type: Weakness to one type + Resistance to another (SPEC_03)

  The spec addresses dual-type weakness-to-both-types (apply once). But doesn't address a dual-type attacker where the defender has Weakness to type A and Resistance to type B. Per rulebook Appendix
  21 p.35: both apply (Weakness first, then Resistance). This needs explicit documentation.

  1. MEDIUM — ATTACH_TOOL missing from AI action priorities (SPEC_05)

  ACTION_PRIORITIES doesn't include ATTACH_TOOL. The AI won't know how to score Tool attachment actions.

  1. LOW — Retreat should explicitly state damage counters + attached cards stay (SPEC_02)

  Rulebook p.12: "Keep all damage counters and all attached cards with each Pokémon when they switch." The spec documents what is removed (Special Conditions, attack effects) but not what is
  preserved.

  1. LOW — Confused self-damage phrasing is ambiguous (SPEC_03)

  Line 140 says "place 3 damage counters (30 damage)" — the "(30 damage)" could imply the damage pipeline. Should explicitly say counter placement per rulebook p.16.

  1. LOW — Checkup KOs can cause simultaneous win (SPEC_02)

If Poison/Burn KOs both Active Pokemon during Checkup and neither player has bench, both meet win conditions simultaneously. The spec covers simultaneous wins for attacks but doesn't explicitly
  extend this to Checkup-triggered KOs
---

### Fix

  All 9 Pass 2 fixes applied across 4 spec files:

  ---
  SPEC_01 (Core Types) — 1 change:

- PlayerAction union: removed trailing semicolon from ATTACH_TOOL branch that broke the union (#27)

  SPEC_02 (Game Flow) — 5 changes:

- Evolution first-turn rule: clarified as per-player (P1 blocked turn 1, P2 blocked turn 2), not per-game (#28)
- Evolution validation table: same per-player first-turn rule + Rare Candy exception documented (#28, #29)
- Rare Candy: `canEvolve` gains `skipStage1` option; effect handler sets it to bypass Stage 1 chain (#29)
- Retreat: explicitly documents that damage counters + attached cards are preserved on switch (#33)
- Checkup §8: KO step documents simultaneous-win rules for Checkup-triggered KOs (#35)
- Acceptance criteria: 3 new items (per-player evo block, Rare Candy, Checkup simultaneous win)

  SPEC_03 (Combat) — 3 changes:

- Weakness §3: dual-type attacker with split W/R — both apply, Weakness first then Resistance (#31)
- Resistance §4: dual-type resistance-to-both applies only once (parallel to Weakness rule) (#31)
- Confused self-damage §5: rephrased to "place 3 damage counters" with explicit "bypasses pipeline" (#34)
- Damage pipeline visualization: fully redrawn with counter/damage fork, 0-check, Tera bench check, simultaneous KO flow (#30)
- Acceptance criteria: 2 new items (dual-type W/R, confused counter placement)

  SPEC_05 (AI Player) — 1 change:

- ACTION_PRIORITIES: added ATTACH_TOOL at priority 72 with context-aware scoring row (#32)
- Acceptance criteria: 1 new item (AI attaches Tools/TMs)

---

### Pass 3

---
I've now read every page of the rulebook and cross-referenced against all 6 specs. Here are my Pass 3 findings:

  ---
  Pass 3 Findings

  1. HIGH — Damage pipeline: self-effect modifiers and stop-at-0 check are misordered (SPEC_03)

  Rulebook p.20 step 2 says: "Figure out damage effects on your Active Pokémon based on Trainer cards or any other relevant effects... then add that in. Stop if the base damage is 0 (or if the attack
  does not do any damage at all)."

  Self-effect modifiers (like "this Pokémon's attacks do 40 more damage next turn") and the stop-at-0 check are in the same step — self-effects are applied first, then the 0-check. The spec separates
  them with the stop-at-0 between attack modifiers (step 2) and self-effects (step 3), and step 3 says "Only apply if base damage is > 0 after step 2." A 0-base-damage attack would never receive
  temporal bonus damage even if the rulebook would let it through.

  1. MEDIUM — TM auto-discard is per-card text, not a universal rule (SPEC_01)

  Glossary p.44: "Technical Machine cards remain attached unless the card text says otherwise." The spec hardcodes "After the Pokemon uses the TM's attack, discard the TM" as a universal rule. Most
  Standard TMs include discard text, but the engine should defer to per-card effect handlers for discard timing.

  1. MEDIUM — Simultaneous win: "wins in more ways" tiebreak not implemented (SPEC_02, SPEC_03)

  Rulebook p.21: "if you win in both ways and your opponent wins in only one way, you are the victor!" The spec treats all simultaneous wins as a draw. Per rulebook, a player who meets 2 win
  conditions while their opponent meets only 1 wins outright. Only equal simultaneous wins trigger a tiebreaker.

  1. LOW — Checkup block ordering flexibility not documented (SPEC_02)

  P.15: "You can check Special Conditions and then other effects, or you can check other effects and then Special Conditions, but you can't mix them up." The spec hardcodes SC first → other effects.
  This is valid but the flexibility should be noted.

  ---

┌──────────┬───────┬─────────────────────────────────────────────────────────────────────────┐
  │ Severity │ Count │                                 Finding                                 │
  ├──────────┼───────┼─────────────────────────────────────────────────────────────────────────┤
  │ HIGH     │ 1     │ #36 — Pipeline stop-at-0 check must come after self-effects, not before │
  ├──────────┼───────┼─────────────────────────────────────────────────────────────────────────┤
  │ MEDIUM   │ 2     │ #37 — TM discard is per-card; #38 — Simultaneous win count tiebreak     │
  ├──────────┼───────┼─────────────────────────────────────────────────────────────────────────┤
  │ LOW      │ 1     │ #39 — Checkup ordering flexibility                                      │
  └──────────┴───────┴─────────────────────────────────────────────────────────────────────────┘
---

### Fix

  All 4 Pass 3 findings reviewed. 1 required spec changes; 3 were already addressed by prior passes.

  ---
  SPEC_03 (Combat) — 3 changes (#36):

- Damage pipeline steps 2-3 merged into a single step 2 matching rulebook p.20 step 2: attack text
    modifiers AND self-effects (temporal damage modifiers) are computed together BEFORE the 0-check.
    Previously they were split into separate numbered steps, which could cause a developer to insert
    the 0-check between attack modifiers and self-effects — a 0-base-damage attack with a +40 temporal
    bonus would incorrectly stop at 0 instead of producing 40 damage.
- Pipeline visualization updated: Step 2 shown as a single box containing both attack mods and
    self-effects, with the 0-check after the combined result.
- Pipeline steps renumbered: 7 steps (was 8) — Weakness is now step 3, Resistance step 4,
    target effects step 5, floor step 6, counter placement step 7.
- New acceptance criterion: self-effects applied in same step as attack mods, before 0-check.

  Already addressed by prior passes (no changes needed):

- #37 (TM auto-discard) — SPEC_01 lines 97-110 already correctly document TM persist-by-default
    with per-card discard via effect handlers (fixed in Pass 1).
- #38 (Simultaneous win count tiebreak) — SPEC_02 §7 and SPEC_03 §10 already document "more
    conditions = outright win" (fixed in Pass 2).
- #39 (Checkup ordering flexibility) — SPEC_02 §8 already notes SC-first vs other-effects-first
    flexibility and documents the engine's chosen ordering (fixed in Pass 2).

---

## notes

● Ready for implementation. Here's my reasoning:

  Diminishing returns curve is clear:

- Pass 1: 26 findings (5 critical, 8 high)
- Pass 2: 9 findings (1 critical, 2 high)
- Pass 3: 4 findings (1 high, 3 already fixed)

  The critical/high density dropped from 50% → 33% → 25%, and the only real code change in Pass 3 was a step-ordering clarification. A fourth pass would likely surface only LOW-tier cosmetic issues.

  What the spec covers well:

- Type system is tight — discriminated unions, readonly throughout, no ambiguity
- Game flow matches rulebook exactly (setup, turns, checkup, win conditions)
- Damage pipeline matches rulebook p.20 step-for-step after the 3 passes
- Edge cases that trip up most TCG engines are explicitly addressed (counter placement vs damage, special condition mutual exclusivity, Tera bench immunity, simultaneous wins, per-player evolution
  blocking)

  What will surface during implementation (normal, not spec gaps):

- Specific card effect interactions that only become apparent when writing handlers
- Energy cost satisfaction algorithm details (it's a matching problem — spec describes it correctly but the implementation may need backtracking)
- AI tuning weights — those are empirical, not spec-derivable
- Adapter parsing edge cases from real SQLite data (malformed JSON, unexpected subtypes)

  Those are all implementation-discovery issues, not spec-audit issues. Trying to anticipate them in the spec would be speculative.

  My recommendation: Start with SPEC_01 (types + adapter). It's the foundation, has zero dependencies, and writing it will validate the type system against real card data from SQLite — which is the
  fastest way to find any remaining gaps.

✻ Worked for 31s

❯ /exit
  ⎿  Catch you later!

❯ Would you say that the spec is defined detailed enough that I could use a claude-sonnet model to implement it or would you suggest a claude-opus model (introspect)
  ⎿  You're out of extra usage · resets 1pm (America/Denver)

❯ Would you say that the spec is defined detailed enough that I could use a claude-sonnet model to implement it or would you suggest a claude-opus model (introspect)

● Sonnet can handle this. The specs are unusually prescriptive — they include exact type definitions, function signatures, step-by-step algorithms, acceptance criteria, and file paths. There's very
  little ambiguity for a model to navigate.

  Where Sonnet will be fine (SPEC_01, SPEC_02, SPEC_06):

- Core types are literally copy-paste from spec with minor adaptation
- Game flow is algorithmic — the spec reads like pseudocode
- Simulation runner is straightforward orchestration
- Adapter is mechanical parsing (SQLite → typed objects)

  Where Opus earns its cost (SPEC_03, SPEC_04, SPEC_05):

- Combat damage pipeline has subtle ordering constraints that require holding 7 steps in context while reasoning about edge cases (0-check placement, counter vs damage distinction, dual-type W/R
  interaction)
- Effect system requires designing the choice-deferral flow — the spec describes what but the control flow for pausing an effect mid-execution to get an AI choice and resuming is a design problem
- AI scoring heuristics need judgment calls on weight interactions — the spec gives the weights but doesn't cover how competing priorities resolve when multiple actions score similarly

  My recommendation: Use Sonnet for SPEC_01 → SPEC_02 → SPEC_06 (the bookends). Switch to Opus for SPEC_03 → SPEC_04 → SPEC_05 (the core mechanics cluster). That's where the reasoning density
  justifies the cost.

  One caveat: whichever model you use, feed it one spec at a time with its dependencies already implemented. Don't dump all 6 specs in one context — even Opus will lose fidelity on the later specs if
  it's holding 6 specs worth of context simultaneously.
