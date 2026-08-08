export class InvalidProductIdError extends Error {
  constructor(readonly productId: string) {
    super(`"${productId}" is not a valid product id`);
    this.name = 'InvalidProductIdError';
  }
}
