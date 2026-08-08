import { ConfigService } from '@nestjs/config';

import type { Address } from '../common/entities/address.embedded';
import type { Env } from '../config/env.schema';
import {
  AddressNotGeocodableError,
  GeocodingUnavailableError,
} from './geocoding.errors';
import { MockGeocodingProvider } from './mock-geocoding.provider';

function providerWithLatency(latencyMs: number): MockGeocodingProvider {
  const config = {
    get: () => latencyMs,
  } as unknown as ConfigService<Env, true>;

  return new MockGeocodingProvider(config);
}

function addressOf(overrides: Partial<Address> = {}): Address {
  return {
    line1: '1 Main Street',
    line2: null,
    city: 'New York',
    region: 'NY',
    postalCode: '10001',
    country: 'US',
    ...overrides,
  };
}

describe('MockGeocodingProvider', () => {
  let provider: MockGeocodingProvider;

  beforeEach(() => {
    provider = providerWithLatency(0);
  });

  describe('seeded cities', () => {
    it('resolves a known city to its real coordinates', async () => {
      const result = await provider.geocode(addressOf());

      expect(result.location.coordinates).toEqual([-74.006, 40.7128]);
      expect(result.precision).toBe('rooftop');
    });

    it('is case insensitive about the city', async () => {
      const result = await provider.geocode(addressOf({ city: 'nEw YoRk' }));

      expect(result.location.coordinates).toEqual([-74.006, 40.7128]);
    });

    it('places different cities in different places', async () => {
      const [newYork, losAngeles] = await Promise.all([
        provider.geocode(addressOf()),
        provider.geocode(addressOf({ city: 'Los Angeles', region: 'CA' })),
      ]);

      expect(newYork.location.coordinates).not.toEqual(
        losAngeles.location.coordinates,
      );
    });
  });

  describe('unknown addresses', () => {
    it('still resolves, so an invented address works', async () => {
      const result = await provider.geocode(
        addressOf({ city: 'Smallville', region: 'KS' }),
      );

      expect(result.precision).toBe('approximate');
      expect(result.location.type).toBe('Point');
    });

    it('resolves the same address to the same point every time', async () => {
      const address = addressOf({ city: 'Smallville', region: 'KS' });
      const [first, second] = await Promise.all([
        provider.geocode(address),
        provider.geocode(address),
      ]);

      expect(second.location.coordinates).toEqual(first.location.coordinates);
    });

    it('ignores surrounding whitespace when resolving', async () => {
      const [tidy, untidy] = await Promise.all([
        provider.geocode(addressOf({ city: 'Smallville', region: 'KS' })),
        provider.geocode(addressOf({ city: '  Smallville  ', region: ' KS ' })),
      ]);

      expect(untidy.location.coordinates).toEqual(tidy.location.coordinates);
      expect(untidy.formattedAddress).toBe(tidy.formattedAddress);
    });

    it('returns coordinates inside valid ranges', async () => {
      const result = await provider.geocode(addressOf({ city: 'Smallville' }));
      const [longitude, latitude] = result.location.coordinates;

      expect(longitude).toBeGreaterThanOrEqual(-180);
      expect(longitude).toBeLessThanOrEqual(180);
      expect(latitude).toBeGreaterThanOrEqual(-90);
      expect(latitude).toBeLessThanOrEqual(90);
    });
  });

  describe('failures', () => {
    it('reports an address it cannot place', async () => {
      await expect(
        provider.geocode(addressOf({ city: 'Nowhere' })),
      ).rejects.toBeInstanceOf(AddressNotGeocodableError);
    });

    it('reports the provider being unreachable', async () => {
      await expect(
        provider.geocode(addressOf({ city: 'Timeout' })),
      ).rejects.toBeInstanceOf(GeocodingUnavailableError);
    });
  });

  it('returns a formatted address without empty parts', async () => {
    const result = await provider.geocode(addressOf({ line2: null }));

    expect(result.formattedAddress).toBe(
      '1 Main Street, New York, NY, 10001, US',
    );
  });

  it('takes time when latency is configured', async () => {
    const slow = providerWithLatency(50);
    const started = Date.now();

    await slow.geocode(addressOf());

    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });
});
