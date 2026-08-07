export class InsufficientStockError extends Error {
  constructor(
    readonly warehouseId: string,
    readonly productId: string,
  ) {
    super(
      `Warehouse ${warehouseId} does not have enough stock of product ${productId}`,
    );
    this.name = 'InsufficientStockError';
  }
}

export class ReservationNotHeldError extends Error {
  constructor(
    readonly warehouseId: string,
    readonly productId: string,
  ) {
    super(
      `Warehouse ${warehouseId} holds no reservation of product ${productId} to settle`,
    );
    this.name = 'ReservationNotHeldError';
  }
}

export class NoWarehouseAvailableError extends Error {
  constructor() {
    super('No single warehouse can fill the entire order');
    this.name = 'NoWarehouseAvailableError';
  }
}
