---
name: Meta Deck Ability Catalog
description: Complete classification of all abilities found across 10 meta decks — passive, activated, and triggered categories with modifier types
type: project
---

Full audit of abilities across all 10 standard meta decks (Dragapult/Dusknoir, Grimmsnarl/Froslass, Gardevoir/Jellicent, Festival Lead, Greninja/Dusknoir, Raging Bolt/Ogerpon, Miraidon/Regieleki, Regidrago/Kyurem, Gholdengo/Mew, Snorlax Stall). Completed 2026-04-05.

**Why:** The engine originally had no ability classification. All abilities were offered as USE_ABILITY actions, causing infinite loops for passive abilities and unbounded repeat usage for activated ones.

**How to apply:** When adding new cards or abilities to the engine, classify them using this catalog as reference. Unknown abilities default to 'activated' (safe — once-per-turn gate prevents loops).

## Passive (continuous modifier — never a player action)

| Card ID | Card | Ability | Modifier Type |
|---------|------|---------|---------------|
| sv6-141 | Bloodmoon Ursaluna ex | Seasoned Skill | Attack cost reduction (per opponent prize taken) |
| sv8-76 | Latias ex | Skyliner | Retreat cost (Basic Pokemon have zero) |
| me2-41 | Mega Diancie ex | Diamond Coat | Damage reduction (-30) |
| rsv10pt5-45 | Jellicent ex | Oceanic Curse | Item/Tool lock (while Active) |
| me2pt5-39 | Psyduck | Damp | Ability lock (self-KO abilities) |
| me2pt5-40 | Golduck | Damp | Ability lock (self-KO abilities) |
| sv6-18 | Dipplin | Festival Lead | Attack modifier (attack twice if Festival Grounds) |
| sv6-44 | Goldeen | Festival Lead | Attack modifier (attack twice if Festival Grounds) |
| sv8pt5-21 | Seaking | Festival Lead | Attack modifier (attack twice if Festival Grounds) |
| sv6-53 | Froslass | Freezing Shroud | Checkup trigger (1 dmg counter on Pokemon with abilities) |
| sv9-56 | Lillie's Clefairy ex | Fairy Zone | Weakness modifier (opponent Dragon weakness = Psychic) |

## Activated (player choice — once per turn unless noted)

| Card ID | Card | Ability | Notes |
|---------|------|---------|-------|
| sv1-81 | Miraidon ex | Tandem Unit | Search 2 Basic Lightning |
| sv1-86 | Gardevoir ex | Psychic Embrace | **Repeatable** ("as often as you like") |
| sv3pt5-151 | Mew ex | Restart | Draw until 3 in hand |
| sv4-139 | Gholdengo ex | Coin Bonus | Draw 1 (2 if Active) |
| sv4-140 | Altaria ex | Humming Heal | Heal 20 from each Pokemon |
| sv4-56 | Iron Bundle | Hyper Blower | Switch opponent Active (from Bench only) |
| sv6-129 | Drakloak | Recon Directive | Top 2 → take 1 |
| sv6-15 | Thwackey | Boom Boom Groove | Search deck (if Active has Festival Lead) |
| sv6-95 | Munkidori | Adrena-Brain | Move up to 3 damage counters |
| sv6pt5-38, me2pt5-142 | Fezandipiti ex | Flip the Script | Draw 3 if your Pokemon KO'd last turn |
| sv8pt5-36 | Dusclops | Cursed Blast | 5 damage counters, self-KO |
| sv8pt5-37 | Dusknoir | Cursed Blast | 13 damage counters, self-KO |
| sv7-118 | Fan Rotom | Fan Call | **First turn only** — search 3 Colorless <=100HP |

## Triggered (automatic on game event — not a main-phase action)

| Card ID | Card | Ability | Trigger |
|---------|------|---------|---------|
| sv1-118 | Hawlucha | Flying Entry | Play from hand to Bench |
| sv10-136 | Marnie's Grimmsnarl ex | Punk Up | Evolution |
| sv6pt5-25 | Bloodmoon Ursaluna | Battle-Hardened | Play from hand to Bench |

## Implementation Status (2026-04-05)

- `AbilityDefinition.category` expanded to `'activated' | 'passive' | 'triggered'`
- `PASSIVE_ABILITY_NAMES` and `TRIGGERED_ABILITY_NAMES` sets in `adapter.ts` classify during card loading
- `TurnFlags.abilitiesUsedThisTurn` tracks once-per-turn enforcement
- "As often as you like" text in ability description bypasses once-per-turn gate
- Passive modifiers wired into `modifiers.ts`: Skyliner (retreat), Seasoned Skill (attack cost)
- Remaining passive abilities (Diamond Coat, Oceanic Curse, Damp, Festival Lead, Fairy Zone, Freezing Shroud) NOT yet wired into modifier/effect pipeline
