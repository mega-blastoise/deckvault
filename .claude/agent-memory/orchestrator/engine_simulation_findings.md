---
name: Game Engine Simulation Findings
description: Critical flaws found in game logic and AI decision-making from running simulated games — deck-out loops, no attacks, no bench development
type: project
---

Ran 5 simulated games (seeds 100-104) with simplified decks (15 basics + 45 energy, no trainers) on 2026-04-05. All games ended by deck-out. Zero games ended by taking 6 prizes.

**Why:** These findings expose fundamental flaws in the game loop and AI strategy that must be fixed before simulation results are meaningful.

**How to apply:** Use this as a checklist when reviewing game engine fixes. The user plans to provide turn-by-turn transcripts from real games to guide improvements.

## Critical Flaws

### 1. AI rarely attacks even when able
Pattern: CARD_DRAWN -> ENERGY_ATTACHED -> PASS, repeating for dozens of turns. The `scoreAction` function in `lib/ai/strategy.ts` scores ATTACK by running `evaluateBoard` on the resulting state, but this often produces a score lower than ENERGY_ATTACHED (25) or other actions. The attack scoring path needs to heavily favor attacking when energy requirements are met.

### 2. No bench development
AI almost never plays PLAY_BASIC_TO_BENCH (scored at flat 20 in strategy.ts). When the active is KO'd, there's nothing to promote. This triggers either an immediate loss or a broken state.

### 3. Post-KO deck draw loop
After a KO when the losing player has no bench, the engine enters a state where the player draws their entire remaining deck (40+ consecutive CARD_DRAWN events) before the game ends by deck-out. The "no Pokemon in play" loss condition may not be triggering correctly, or the draw-loop is a side effect of the mulligan/setup logic leaking into main phase.

### 4. Energy over-stacking
AI attaches energy every turn to the same Pokemon with no strategic cap. A Pokemon with 10+ energy gets more energy while bench Pokemon have none. The `scoreEnergyAttach` function gives 40 points for "enables an attack" but doesn't penalize redundant attachment.

### 5. Game 102: 91 turns, zero KOs
Both players spent the entire game drawing and attaching energy. Neither player ever attacked. This suggests the attack action is systematically undervalued or the energy-cost check is preventing attacks that should be legal.

## AI Strategy Weights (current, from strategy.ts)

| Action | Score | Problem |
|--------|-------|---------|
| ATTACK | evaluateBoard() result | Often lower than simple actions |
| EVOLVE_POKEMON | 80 | Reasonable but never happens (no Stage 1s in test) |
| PLAY_TRAINER (Supporter) | 30-90 | Context-dependent on hand size |
| ATTACH_ENERGY (to active) | 25-40 | Too high relative to attack |
| PLAY_BASIC_TO_BENCH | 20 | Far too low — bench is critical |
| USE_ABILITY | evaluateBoard() + 5 | Now gated by once-per-turn |
| RETREAT | -30 to +40 | Type advantage aware |
| PASS | 0 | Baseline |

## Next Steps
User will provide turn-by-turn game transcripts from the browser-based simulator to establish ground truth for how games should flow. These transcripts will guide targeted fixes to both game logic and AI weights.
