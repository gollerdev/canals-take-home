export class OrderNotFoundError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} does not exist`);
    this.name = 'OrderNotFoundError';
  }
}
