import { getBaseAPIURL } from './APIModel';

export interface ArchetypeFrequency {
  archetype: string;
  archetypeName: string;
  format: string;
  reportCount: number;
  winCount: number;
  lossCount: number;
  tieCount: number;
  winRate: number | null;
  lastSeen: string;
}

export interface FrequencyResponse {
  archetypes: ArchetypeFrequency[];
  generatedAt: string;
  dayRange: number;
  totalReports: number;
}

export async function fetchFrequency(format: string): Promise<FrequencyResponse> {
  const params = new URLSearchParams({ limit: '20', days: '30' });
  if (format !== 'all') params.set('format', format);
  const res = await fetch(`${getBaseAPIURL()}/local-meta/frequency?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch local meta');
  return res.json() as Promise<FrequencyResponse>;
}
