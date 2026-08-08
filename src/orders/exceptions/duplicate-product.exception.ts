export class DuplicateProductError extends Error {
  constructor(readonly productId: string) {
    super(`Product ${productId} appears more than once in the order`);
    this.name = 'DuplicateProductError';
  }
}
