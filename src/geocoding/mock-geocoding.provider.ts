import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Address } from '../common/entities/address.embedded';
import { simulateNetworkLatency } from '../common/simulated-latency';
import { geoPoint } from '../common/types/geo-point';
import type { Env } from '../config/env.schema';
import type {
  GeocodedAddress,
  GeocodingProvider,
} from './geocoding-provider.interface';
import {
  AddressNotGeocodableError,
  GeocodingUnavailableError,
} from './geocoding.errors';

const KNOWN_CITIES = new Map<string, { longitude: number; latitude: number }>([
  ['us/new york', { longitude: -74.006, latitude: 40.7128 }],
  ['us/philadelphia', { longitude: -75.1652, latitude: 39.9526 }],
  ['us/chicago', { longitude: -87.6298, latitude: 41.8781 }],
  ['us/denver', { longitude: -104.9903, latitude: 39.7392 }],
  ['us/los angeles', { longitude: -118.2437, latitude: 34.0522 }],
  ['us/miami', { longitude: -80.1918, latitude: 25.7617 }],
  ['us/seattle', { longitude: -122.3321, latitude: 47.6062 }],
  ['us/austin', { longitude: -97.7431, latitude: 30.2672 }],
]);

const US_STATES = new Map<string, { longitude: number; latitude: number }>([
  ['al', { longitude: -86.79, latitude: 32.81 }],
  ['ak', { longitude: -152.4, latitude: 64.07 }],
  ['az', { longitude: -111.66, latitude: 34.29 }],
  ['ar', { longitude: -92.44, latitude: 34.9 }],
  ['ca', { longitude: -119.68, latitude: 37.18 }],
  ['co', { longitude: -105.55, latitude: 39.0 }],
  ['ct', { longitude: -72.73, latitude: 41.62 }],
  ['dc', { longitude: -77.03, latitude: 38.9 }],
  ['de', { longitude: -75.51, latitude: 38.99 }],
  ['fl', { longitude: -81.69, latitude: 28.63 }],
  ['ga', { longitude: -83.44, latitude: 32.64 }],
  ['hi', { longitude: -156.35, latitude: 20.29 }],
  ['ia', { longitude: -93.5, latitude: 42.07 }],
  ['id', { longitude: -114.66, latitude: 44.35 }],
  ['il', { longitude: -89.2, latitude: 40.06 }],
  ['in', { longitude: -86.28, latitude: 39.89 }],
  ['ks', { longitude: -98.38, latitude: 38.48 }],
  ['ky', { longitude: -85.3, latitude: 37.53 }],
  ['la', { longitude: -91.96, latitude: 31.07 }],
  ['ma', { longitude: -71.82, latitude: 42.26 }],
  ['md', { longitude: -76.8, latitude: 39.06 }],
  ['me', { longitude: -69.24, latitude: 45.37 }],
  ['mi', { longitude: -85.41, latitude: 44.35 }],
  ['mn', { longitude: -94.31, latitude: 46.28 }],
  ['mo', { longitude: -92.48, latitude: 38.36 }],
  ['ms', { longitude: -89.66, latitude: 32.74 }],
  ['mt', { longitude: -109.64, latitude: 47.05 }],
  ['nc', { longitude: -79.36, latitude: 35.54 }],
  ['nd', { longitude: -100.47, latitude: 47.45 }],
  ['ne', { longitude: -99.68, latitude: 41.53 }],
  ['nh', { longitude: -71.58, latitude: 43.68 }],
  ['nj', { longitude: -74.66, latitude: 40.19 }],
  ['nm', { longitude: -106.11, latitude: 34.41 }],
  ['nv', { longitude: -116.65, latitude: 39.36 }],
  ['ny', { longitude: -75.5, latitude: 42.95 }],
  ['oh', { longitude: -82.79, latitude: 40.29 }],
  ['ok', { longitude: -97.51, latitude: 35.59 }],
  ['or', { longitude: -120.56, latitude: 43.94 }],
  ['pa', { longitude: -77.8, latitude: 40.88 }],
  ['ri', { longitude: -71.51, latitude: 41.68 }],
  ['sc', { longitude: -80.9, latitude: 33.92 }],
  ['sd', { longitude: -100.23, latitude: 44.44 }],
  ['tn', { longitude: -86.35, latitude: 35.86 }],
  ['tx', { longitude: -99.34, latitude: 31.49 }],
  ['ut', { longitude: -111.68, latitude: 39.31 }],
  ['va', { longitude: -78.82, latitude: 37.52 }],
  ['vt', { longitude: -72.66, latitude: 44.08 }],
  ['wa', { longitude: -120.45, latitude: 47.38 }],
  ['wi', { longitude: -89.94, latitude: 44.62 }],
  ['wv', { longitude: -80.61, latitude: 38.64 }],
  ['wy', { longitude: -107.55, latitude: 43.0 }],
]);

const NOT_FOUND_CITY = 'nowhere';
const UNAVAILABLE_CITY = 'timeout';

function normalise(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function formatAddress(address: Address): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .map(normalise)
    .filter((part) => part.length > 0)
    .join(', ');
}

function hash(value: string): number {
  let result = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }

  return result >>> 0;
}

@Injectable()
export class MockGeocodingProvider implements GeocodingProvider {
  private readonly latencyMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.latencyMs = config.get('GEOCODING_MOCK_LATENCY_MS', { infer: true });
  }

  /**
   * Resolves a postal address to coordinates.
   *
   * Seeded cities resolve to their real coordinates, any other US address
   * falls back to its state centroid, and anything else hashes to a stable
   * point. An invented address always resolves, and always to the same place.
   *
   * @param address - the shipping address to locate
   * @returns the location, how precise it is, and the normalised address
   * @throws AddressNotGeocodableError for a city named "Nowhere"
   * @throws GeocodingUnavailableError for a city named "Timeout"
   */
  async geocode(address: Address): Promise<GeocodedAddress> {
    await simulateNetworkLatency(this.latencyMs);

    const formattedAddress = formatAddress(address);
    const city = normalise(address.city).toLowerCase();
    const country = normalise(address.country).toLowerCase();

    if (city === NOT_FOUND_CITY) {
      throw new AddressNotGeocodableError(formattedAddress);
    }

    if (city === UNAVAILABLE_CITY) {
      throw new GeocodingUnavailableError(
        503,
        'Geocoding provider is unavailable.',
      );
    }

    const known = KNOWN_CITIES.get(`${country}/${city}`);

    if (known) {
      return {
        location: geoPoint(known.longitude, known.latitude),
        precision: 'rooftop',
        formattedAddress,
      };
    }

    const state = US_STATES.get(normalise(address.region).toLowerCase());

    if (country === 'us' && state) {
      return {
        location: geoPoint(state.longitude, state.latitude),
        precision: 'approximate',
        formattedAddress,
      };
    }

    const seed = hash(formattedAddress.toLowerCase());
    const longitude = -125 + (seed % 5800) / 100;
    const latitude = 25 + ((seed >>> 13) % 2400) / 100;

    return {
      location: geoPoint(
        Number(longitude.toFixed(6)),
        Number(latitude.toFixed(6)),
      ),
      precision: 'approximate',
      formattedAddress,
    };
  }
}
