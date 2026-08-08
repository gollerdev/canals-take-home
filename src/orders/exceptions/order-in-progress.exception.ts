export class OrderInProgressError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} is still being processed`);
    this.name = 'OrderInProgressError';
  }
}
