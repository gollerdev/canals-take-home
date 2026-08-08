export class IdempotencyConflictError extends Error {
  constructor(
    readonly customerId: string,
    readonly idempotencyKey: string,
  ) {
    super(`Customer ${customerId} already used idempotency key`);
    this.name = 'IdempotencyConflictError';
  }
}
