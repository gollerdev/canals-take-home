export class IdempotencyConflictError extends Error {
  constructor(
    readonly customerId: string,
    readonly idempotencyKey: string,
  ) {
    super(`Customer ${customerId} already used idempotency key`);
    this.name = 'IdempotencyConflictError';
  }
}

export class OrderNotPendingError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} is missing or has already been settled`);
    this.name = 'OrderNotPendingError';
  }
}

export class CustomerNotFoundError extends Error {
  constructor(readonly customerId: string) {
    super(`Customer ${customerId} does not exist`);
    this.name = 'CustomerNotFoundError';
  }
}
