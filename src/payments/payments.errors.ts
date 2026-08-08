export class PaymentUnavailableError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentUnavailableError';
  }
}

export class PaymentRequestRejectedError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentRequestRejectedError';
  }
}
