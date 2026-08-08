export class NoWarehouseAvailableError extends Error {
  constructor() {
    super('No single warehouse can fill the entire order');
    this.name = 'NoWarehouseAvailableError';
  }
}
