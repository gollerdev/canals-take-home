export class CustomerNotFoundError extends Error {
  constructor(readonly customerId: string) {
    super(`Customer ${customerId} does not exist`);
    this.name = 'CustomerNotFoundError';
  }
}
