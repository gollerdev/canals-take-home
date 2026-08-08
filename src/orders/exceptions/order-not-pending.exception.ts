export class OrderNotPendingError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} is missing or has already been settled`);
    this.name = 'OrderNotPendingError';
  }
}
