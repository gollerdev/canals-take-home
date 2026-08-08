export class InvalidCustomerIdError extends Error {
  constructor(readonly customerId: string) {
    super(`"${customerId}" is not a valid customer id`);
    this.name = 'InvalidCustomerIdError';
  }
}
