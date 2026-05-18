import * as z from 'zod/mini';

export class MalformedJohtoConfig extends Error {
  constructor(error: unknown) {
    const issues = error instanceof z.core.$ZodError
      ? error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
      : String(error);
    super(`Malformed Johto config:\n${issues}\n(Run \`johto init\` to regenerate)`);
    this.name = 'MalformedJohtoConfig';
    if (error instanceof Error) {
      this.cause = error;
    }
  }
}
