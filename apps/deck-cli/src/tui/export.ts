import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Entry } from './store';

export interface ExportInput {
  readonly entries: readonly Entry[];
  readonly reasoning: string;
  readonly providerName: string;
  readonly model: string;
  readonly deckNames: readonly string[];
  readonly includeReasoning: boolean;
}

export function buildSessionMarkdown(input: ExportInput): string {
  const lines: string[] = [
    '# johto session',
    '',
    `- **Provider:** ${input.providerName}`,
    `- **Model:** ${input.model}`,
    `- **Deck(s):** ${input.deckNames.join(', ') || '(none)'}`,
    `- **Exported:** ${new Date().toISOString()}`,
    '',
    '---',
    ''
  ];

  for (const entry of input.entries) {
    switch (entry.kind) {
      case 'user':
        lines.push(`## ${entry.text}`, '');
        break;
      case 'assistant':
        if (entry.text.trim()) lines.push(entry.text.trim(), '');
        break;
      case 'tool':
        lines.push(`> tool: \`${entry.name}\` — ${entry.state}`, '');
        break;
      case 'error':
        lines.push(`> **error:** ${entry.text}`, '');
        break;
      case 'reasoning':
        break;
    }
  }

  if (input.includeReasoning && input.reasoning.trim()) {
    lines.push('---', '', '## Reasoning trace', '', '```', input.reasoning.trim(), '```', '');
  }

  return lines.join('\n');
}

export function exportSession(input: ExportInput, dir = process.cwd()): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = join(dir, `johto-session-${stamp}.md`);
  writeFileSync(path, buildSessionMarkdown(input), 'utf-8');
  return path;
}
