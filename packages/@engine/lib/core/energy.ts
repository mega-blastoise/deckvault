import type { EnergyType } from '../types/card';

export function canPayEnergyCost(
  cost: ReadonlyArray<EnergyType>,
  attachedEnergy: ReadonlyArray<{ readonly provides: ReadonlyArray<EnergyType> }>
): boolean {
  const typedCost = cost.filter(e => e !== 'Colorless');
  const colorlessCost = cost.filter(e => e === 'Colorless').length;

  const used = new Array<boolean>(attachedEnergy.length).fill(false);

  for (const required of typedCost) {
    let satisfied = false;
    for (let i = 0; i < attachedEnergy.length; i++) {
      if (!used[i] && attachedEnergy[i]!.provides.includes(required)) {
        used[i] = true;
        satisfied = true;
        break;
      }
    }
    if (!satisfied) return false;
  }

  let remaining = colorlessCost;
  for (let i = 0; i < attachedEnergy.length && remaining > 0; i++) {
    if (!used[i]) {
      used[i] = true;
      remaining--;
    }
  }
  return remaining === 0;
}

export function canPayRetreatCost(
  retreatCost: number,
  attachedEnergy: ReadonlyArray<{ readonly provides: ReadonlyArray<EnergyType> }>
): boolean {
  return attachedEnergy.length >= retreatCost;
}
