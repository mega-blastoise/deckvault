export interface PtcglParseResult {
  readonly cards: ReadonlyArray<{
    readonly cardId: string;
    readonly count: number;
    readonly rawLine: string;
    readonly resolved: boolean;
    readonly error?: string;
  }>;
  readonly totalCards: number;
  readonly errors: ReadonlyArray<{ readonly line: number; readonly message: string }>;
  readonly isValid: boolean;
}

export interface SetAbbreviationMap {
  readonly [abbreviation: string]: string;
}

const SECTION_HEADER = /^(Pok[eé]mon|Trainer|Energy|Total Cards)\s*:/i;
const CARD_LINE = /^(\d+)\s+(.+?)\s+([A-Z][A-Z0-9]*)[\s-](\d+)$/;
const BLANK_OR_COMMENT = /^\s*$|^#|^\/\//;

export function parsePtcglList(
  text: string,
  setAbbreviations: SetAbbreviationMap
): PtcglParseResult {
  const lines = text.split('\n');
  const cards: Array<{
    cardId: string;
    count: number;
    rawLine: string;
    resolved: boolean;
    error?: string;
  }> = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    if (BLANK_OR_COMMENT.test(trimmed)) continue;
    if (SECTION_HEADER.test(trimmed)) continue;

    const match = CARD_LINE.exec(trimmed);
    if (!match) {
      errors.push({ line: i + 1, message: `Unrecognized line: "${trimmed}"` });
      continue;
    }

    const count = parseInt(match[1]!, 10);
    const setCode = match[3]!;
    const number = match[4]!;

    const setId = setAbbreviations[setCode];
    if (!setId) {
      errors.push({ line: i + 1, message: `Unknown set code: "${setCode}"` });
      cards.push({ cardId: '', count, rawLine: trimmed, resolved: false, error: `Unknown set code: "${setCode}"` });
      continue;
    }

    const cardId = `${setId}-${number}`;
    cards.push({ cardId, count, rawLine: trimmed, resolved: true });
  }

  const totalCards = cards.reduce((sum, c) => sum + c.count, 0);

  return {
    cards,
    totalCards,
    errors,
    isValid: totalCards === 60 && errors.length === 0
  };
}
