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
