export enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Failed = 'failed',
}

export enum OrderFailureReason {
  NoWarehouseAvailable = 'no_warehouse_available',
  PaymentDeclined = 'payment_declined',
}
