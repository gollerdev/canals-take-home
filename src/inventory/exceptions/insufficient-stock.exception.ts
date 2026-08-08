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
