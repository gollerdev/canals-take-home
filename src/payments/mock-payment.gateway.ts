import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

import { simulateNetworkLatency } from '../common/simulated-latency';
import type { Env } from '../config/env.schema';
import type {
  ChargeRequest,
  ChargeResult,
  DeclineCode,
  PaymentGateway,
} from './payment-gateway.interface';
import {
  PaymentRequestRejectedError,
  PaymentUnavailableError,
} from './payments.errors';

type Outcome =
  | { kind: 'captured' }
  | { kind: 'declined'; code: DeclineCode; message: string }
  | { kind: 'unavailable'; httpStatus: number; message: string };

const OUTCOMES_BY_CARD = new Map<string, Outcome>([
  ['4242424242424242', { kind: 'captured' }],
  [
    '4000000000000002',
    {
      kind: 'declined',
      code: 'generic_decline',
      message: 'Your card was declined.',
    },
  ],
  [
    '4000000000009995',
    {
      kind: 'declined',
      code: 'insufficient_funds',
      message: 'Your card has insufficient funds.',
    },
  ],
  [
    '4000000000009987',
    {
      kind: 'declined',
      code: 'lost_card',
      message: 'Your card was declined.',
    },
  ],
  [
    '4000000000009979',
    {
      kind: 'declined',
      code: 'stolen_card',
      message: 'Your card was declined.',
    },
  ],
  [
    '4000000000000069',
    {
      kind: 'declined',
      code: 'expired_card',
      message: 'Your card has expired.',
    },
  ],
  [
    '4000000000000127',
    {
      kind: 'declined',
      code: 'incorrect_cvc',
      message: "Your card's security code is incorrect.",
    },
  ],
  [
    '4000000000000119',
    {
      kind: 'unavailable',
      httpStatus: 500,
      message: 'An error occurred while processing your card.',
    },
  ],
  [
    '4000000000009235',
    {
      kind: 'unavailable',
      httpStatus: 429,
      message: 'Too many requests, please retry.',
    },
  ],
]);

function digitsOf(cardNumber: string): string {
  return cardNumber.replace(/[\s-]/g, '');
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;

    if (value < 0 || value > 9) {
      return false;
    }

    if (double) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }

    sum += value;
    double = !double;
  }

  return digits.length >= 12 && sum % 10 === 0;
}

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly latencyMs: number;
  private readonly settled = new Map<string, ChargeResult>();

  constructor(config: ConfigService<Env, true>) {
    this.latencyMs = config.get('PAYMENT_MOCK_LATENCY_MS', { infer: true });
  }

  /**
   * Charges a card for the given amount.
   *
   * Behaves like a real gateway call: it takes time, honours the idempotency
   * key, and fails in the ways Stripe fails. Outcomes are selected by card
   * number using Stripe's published test numbers.
   *
   * @param request - card, amount, description and idempotency key
   * @returns captured with a reference, or declined with a reason
   * @throws PaymentUnavailableError when the outcome is unknown
   * @throws PaymentRequestRejectedError when the request itself was invalid
   */
  async charge(request: ChargeRequest): Promise<ChargeResult> {
    await simulateNetworkLatency(this.latencyMs);

    const digits = digitsOf(request.cardNumber);

    if (!passesLuhn(digits)) {
      throw new PaymentRequestRejectedError(400, 'Invalid card number.');
    }

    if (request.amountCents <= 0) {
      throw new PaymentRequestRejectedError(
        400,
        'Amount must be greater than zero.',
      );
    }

    const replayed = this.settled.get(request.idempotencyKey);
    if (replayed) {
      return replayed;
    }

    const outcome = OUTCOMES_BY_CARD.get(digits) ?? { kind: 'captured' };

    if (outcome.kind === 'unavailable') {
      throw new PaymentUnavailableError(outcome.httpStatus, outcome.message);
    }

    const result: ChargeResult =
      outcome.kind === 'captured'
        ? { status: 'captured', reference: this.reference() }
        : {
            status: 'declined',
            code: outcome.code,
            message: outcome.message,
          };

    this.settled.set(request.idempotencyKey, result);

    return result;
  }

  private reference(): string {
    return `ch_${randomBytes(12).toString('hex')}`;
  }
}
