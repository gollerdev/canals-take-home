import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';
import { MockPaymentGateway } from './mock-payment.gateway';
import type { ChargeRequest } from './payment-gateway.interface';
import {
  PaymentRequestRejectedError,
  PaymentUnavailableError,
} from './payments.errors';

const SUCCESS = '4242424242424242';
const DECLINED = '4000000000000002';
const NO_FUNDS = '4000000000009995';
const EXPIRED = '4000000000000069';
const SERVER_ERROR = '4000000000000119';
const RATE_LIMITED = '4000000000009235';

function gatewayWithLatency(latencyMs: number): MockPaymentGateway {
  const config = {
    get: () => latencyMs,
  } as unknown as ConfigService<Env, true>;

  return new MockPaymentGateway(config);
}

function chargeOf(overrides: Partial<ChargeRequest> = {}): ChargeRequest {
  return {
    cardNumber: SUCCESS,
    amountCents: 3998,
    currency: 'USD',
    description: 'Order 019fda72',
    idempotencyKey: 'key-1',
    ...overrides,
  };
}

describe('MockPaymentGateway', () => {
  let gateway: MockPaymentGateway;

  beforeEach(() => {
    gateway = gatewayWithLatency(0);
  });

  describe('outcomes', () => {
    it('captures a good card and returns a reference', async () => {
      const result = await gateway.charge(chargeOf());

      expect(result.status).toBe('captured');
      expect(result).toHaveProperty('reference', expect.stringMatching(/^ch_/));
    });

    it('captures any card without a specific test behaviour', async () => {
      const result = await gateway.charge(
        chargeOf({ cardNumber: '5555555555554444' }),
      );

      expect(result.status).toBe('captured');
    });

    it.each([
      [DECLINED, 'generic_decline'],
      [NO_FUNDS, 'insufficient_funds'],
      [EXPIRED, 'expired_card'],
    ])('declines %s as %s', async (cardNumber, code) => {
      const result = await gateway.charge(chargeOf({ cardNumber }));

      expect(result).toMatchObject({ status: 'declined', code });
    });
  });

  describe('failures the caller must not treat as a decline', () => {
    it('throws when the provider returns a server error', async () => {
      await expect(
        gateway.charge(chargeOf({ cardNumber: SERVER_ERROR })),
      ).rejects.toBeInstanceOf(PaymentUnavailableError);
    });

    it('throws when the provider rate limits', async () => {
      await expect(
        gateway.charge(chargeOf({ cardNumber: RATE_LIMITED })),
      ).rejects.toBeInstanceOf(PaymentUnavailableError);
    });

    it('rejects a card number that fails the Luhn check', async () => {
      await expect(
        gateway.charge(chargeOf({ cardNumber: '4242424242424243' })),
      ).rejects.toBeInstanceOf(PaymentRequestRejectedError);
    });

    it('rejects a non-positive amount', async () => {
      await expect(
        gateway.charge(chargeOf({ amountCents: 0 })),
      ).rejects.toBeInstanceOf(PaymentRequestRejectedError);
    });
  });

  describe('idempotency', () => {
    it('returns the original result for a replayed key', async () => {
      const first = await gateway.charge(chargeOf());
      const second = await gateway.charge(chargeOf());

      expect(second).toEqual(first);
    });

    it('does not issue a second reference for a replayed key', async () => {
      const first = await gateway.charge(chargeOf());
      const second = await gateway.charge(
        chargeOf({ description: 'retried after a timeout' }),
      );

      expect(second).toHaveProperty(
        'reference',
        (first as { reference: string }).reference,
      );
    });

    it('replays a decline as the same decline', async () => {
      const request = chargeOf({ cardNumber: NO_FUNDS, idempotencyKey: 'k2' });
      const first = await gateway.charge(request);
      const second = await gateway.charge(request);

      expect(second).toEqual(first);
    });

    it('still rejects an invalid request when the key was already used', async () => {
      await gateway.charge(chargeOf({ idempotencyKey: 'reused' }));

      await expect(
        gateway.charge(
          chargeOf({
            idempotencyKey: 'reused',
            cardNumber: '4242424242424243',
          }),
        ),
      ).rejects.toBeInstanceOf(PaymentRequestRejectedError);
    });

    it('charges separately under a different key', async () => {
      const first = await gateway.charge(chargeOf({ idempotencyKey: 'a' }));
      const second = await gateway.charge(chargeOf({ idempotencyKey: 'b' }));

      expect(second).not.toEqual(first);
    });
  });

  describe('latency', () => {
    it('takes time when latency is configured', async () => {
      const slow = gatewayWithLatency(50);
      const started = Date.now();

      await slow.charge(chargeOf());

      expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    });
  });
});
