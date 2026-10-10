// Errors raised by kernel actions. dispatch turns them into { ok: false, error } results;
// any other thrown error is a bug and is rethrown.

export class KernelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'KernelError';
  }
}
