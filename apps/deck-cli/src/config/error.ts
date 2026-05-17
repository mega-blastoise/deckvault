export class MalformedJohtoConfig extends Error {
  z: unknown;
  constructor(error: unknown) {
    super();
    if (error instanceof Error) {
      this.cause = error.cause;
      this.message = `Malformed Johto configuration: ${error.message}`;
      this.stack = error.stack;
      this.z = error;
    }
  }
}
