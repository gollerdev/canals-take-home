export class InvalidQuantityError extends Error {
  constructor(
    readonly productId: string,
    readonly quantity: number,
  ) {
    super(`Quantity for product ${productId} must be a positive whole number`);
    this.name = 'InvalidQuantityError';
  }
}
