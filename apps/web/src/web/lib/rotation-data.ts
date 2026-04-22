export interface RotationEntry {
  seasonYear: string;
  rotationDate: string;
  legalMarks: string[];
  rotatedMarks: string[];
  legalSets: { name: string; code: string; mark: string }[];
  rotatedSets: { name: string; code: string; mark: string }[];
  notes?: string;
}

export const ROTATION_HISTORY: RotationEntry[] = [
  {
    seasonYear: '2026',
    rotationDate: '2026-04-10',
    legalMarks: ['H', 'I', 'J'],
    rotatedMarks: ['G'],
    legalSets: [
      { name: 'Temporal Forces', code: 'TEF', mark: 'H' },
      { name: 'Twilight Masquerade', code: 'TWM', mark: 'H' },
      { name: 'Shrouded Fable', code: 'SHF', mark: 'H' },
      { name: 'Stellar Crown', code: 'SCR', mark: 'H' },
      { name: 'Surging Sparks', code: 'SSP', mark: 'H' },
      { name: 'Prismatic Evolutions', code: 'PRE', mark: 'H' },
      { name: 'Journey Together', code: 'JTG', mark: 'I' },
      { name: 'Destined Rivals', code: 'DRI', mark: 'I' },
      { name: 'Mega Evolution', code: 'MEG', mark: 'I' },
      { name: 'Phantasmal Flames', code: 'PFL', mark: 'I' },
      { name: 'Ascended Heroes', code: 'ASC', mark: 'J' },
      { name: 'Perfect Order', code: 'POR', mark: 'J' }
    ],
    rotatedSets: [
      { name: 'Scarlet & Violet', code: 'SVI', mark: 'G' },
      { name: 'Paldea Evolved', code: 'PAL', mark: 'G' },
      { name: 'Obsidian Flames', code: 'OBF', mark: 'G' },
      { name: '151', code: 'MEW', mark: 'G' },
      { name: 'Paradox Rift', code: 'PAR', mark: 'G' },
      { name: 'Paldean Fates', code: 'PAF', mark: 'G' }
    ],
    notes: 'Mid-season rotation effective April 10, 2026. All early Scarlet & Violet sets (G mark, SV1–SV4) rotate out. J-mark sets become legal.'
  },
  {
    seasonYear: '2025-2026',
    rotationDate: '2025-08-15',
    legalMarks: ['G', 'H', 'I'],
    rotatedMarks: ['D', 'E', 'F'],
    legalSets: [
      { name: 'Scarlet & Violet', code: 'SVI', mark: 'G' },
      { name: 'Paldea Evolved', code: 'PAL', mark: 'G' },
      { name: 'Obsidian Flames', code: 'OBF', mark: 'G' },
      { name: '151', code: 'MEW', mark: 'G' },
      { name: 'Paradox Rift', code: 'PAR', mark: 'G' },
      { name: 'Paldean Fates', code: 'PAF', mark: 'G' },
      { name: 'Temporal Forces', code: 'TEF', mark: 'H' },
      { name: 'Twilight Masquerade', code: 'TWM', mark: 'H' },
      { name: 'Shrouded Fable', code: 'SHF', mark: 'H' },
      { name: 'Stellar Crown', code: 'SCR', mark: 'H' },
      { name: 'Surging Sparks', code: 'SSP', mark: 'H' },
      { name: 'Prismatic Evolutions', code: 'PRE', mark: 'H' },
      { name: 'Journey Together', code: 'JTG', mark: 'I' },
      { name: 'Destined Rivals', code: 'DRI', mark: 'I' }
    ],
    rotatedSets: [
      { name: 'Brilliant Stars', code: 'BRS', mark: 'D' },
      { name: 'Astral Radiance', code: 'ASR', mark: 'D' },
      { name: 'Pokémon GO', code: 'PGO', mark: 'D' },
      { name: 'Lost Origin', code: 'LOR', mark: 'E' },
      { name: 'Silver Tempest', code: 'SIT', mark: 'E' },
      { name: 'Crown Zenith', code: 'CRZ', mark: 'F' }
    ],
    notes: 'First rotation of the Scarlet & Violet era. All Sword & Shield sets (D/E/F marks) rotate out.'
  },
  {
    seasonYear: '2024-2025',
    rotationDate: '2024-08-16',
    legalMarks: ['F', 'G', 'H'],
    rotatedMarks: ['A', 'B', 'C'],
    legalSets: [
      { name: 'Crown Zenith', code: 'CRZ', mark: 'F' },
      { name: 'Scarlet & Violet', code: 'SVI', mark: 'G' },
      { name: 'Paldea Evolved', code: 'PAL', mark: 'G' },
      { name: 'Obsidian Flames', code: 'OBF', mark: 'G' },
      { name: '151', code: 'MEW', mark: 'G' },
      { name: 'Paradox Rift', code: 'PAR', mark: 'G' },
      { name: 'Paldean Fates', code: 'PAF', mark: 'G' },
      { name: 'Temporal Forces', code: 'TEF', mark: 'H' },
      { name: 'Twilight Masquerade', code: 'TWM', mark: 'H' },
      { name: 'Shrouded Fable', code: 'SHF', mark: 'H' },
      { name: 'Stellar Crown', code: 'SCR', mark: 'H' }
    ],
    rotatedSets: [
      { name: 'Sword & Shield', code: 'SSH', mark: 'A' },
      { name: 'Rebel Clash', code: 'RCL', mark: 'A' },
      { name: 'Darkness Ablaze', code: 'DAA', mark: 'A' },
      { name: 'Champion\'s Path', code: 'CPA', mark: 'A' },
      { name: 'Vivid Voltage', code: 'VIV', mark: 'B' },
      { name: 'Shining Fates', code: 'SHF', mark: 'B' },
      { name: 'Battle Styles', code: 'BST', mark: 'B' },
      { name: 'Chilling Reign', code: 'CRE', mark: 'C' },
      { name: 'Evolving Skies', code: 'EVS', mark: 'C' },
      { name: 'Fusion Strike', code: 'FST', mark: 'C' },
      { name: 'Celebrations', code: 'CEL', mark: 'C' }
    ]
  }
];

export const CURRENT_ROTATION = ROTATION_HISTORY[0] as RotationEntry;
