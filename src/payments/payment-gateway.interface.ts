export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type DeclineCode =
  | 'generic_decline'
  | 'insufficient_funds'
  | 'lost_card'
  | 'stolen_card'
  | 'expired_card'
  | 'incorrect_cvc';

export interface ChargeRequest {
  cardNumber: string;
  amountCents: number;
  currency: string;
  description: string;
  idempotencyKey: string;
}

export type ChargeResult =
  | { status: 'captured'; reference: string }
  | { status: 'declined'; code: DeclineCode; message: string };

export interface PaymentGateway {
  /**
   * Charges a card for the given amount.
   *
   * @param request - card, amount, description, and an idempotency key that
   *   must be globally unique. Pass the order id.
   * @returns captured with a reference, or declined with a reason
   * @throws PaymentUnavailableError when the outcome is unknown and the
   *   charge must be retried with the same idempotency key
   * @throws PaymentRequestRejectedError when the request itself was invalid
   */
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
