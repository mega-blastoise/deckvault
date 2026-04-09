// Format configuration — pure helpers with no runtime dependencies.
// Safe for use in browser/worker contexts.

export const ROTATION_DATE = new Date('2026-04-10');
export const PRE_ROTATION_MARKS = ['G', 'H', 'I'] as const;
export const POST_ROTATION_MARKS = ['H', 'I', 'J'] as const;

export function getLegalRegulationMarks(formatDate: Date): ReadonlyArray<string> {
  return formatDate >= ROTATION_DATE ? POST_ROTATION_MARKS : PRE_ROTATION_MARKS;
}
