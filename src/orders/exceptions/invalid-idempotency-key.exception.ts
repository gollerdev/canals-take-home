export class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super('An idempotency key is required');
    this.name = 'InvalidIdempotencyKeyError';
  }
}
