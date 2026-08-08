export class EmptyOrderError extends Error {
  constructor() {
    super('An order must contain at least one item');
    this.name = 'EmptyOrderError';
  }
}
