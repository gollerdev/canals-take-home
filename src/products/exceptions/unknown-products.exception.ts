export class UnknownProductsError extends Error {
  constructor(readonly productIds: readonly string[]) {
    super(`Unknown products: ${productIds.join(', ')}`);
    this.name = 'UnknownProductsError';
  }
}
