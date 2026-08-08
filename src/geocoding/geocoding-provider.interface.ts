import type { Address } from '../common/entities/address.embedded';
import type { GeoPoint } from '../common/types/geo-point';

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');

export type GeocodePrecision = 'rooftop' | 'interpolated' | 'approximate';

export interface GeocodedAddress {
  location: GeoPoint;
  precision: GeocodePrecision;
  formattedAddress: string;
}

export interface GeocodingProvider {
  /**
   * Resolves a postal address to coordinates.
   *
   * @param address - the shipping address to locate
   * @returns the location, how precise it is, and the normalised address
   * @throws AddressNotGeocodableError when the address matches nothing
   * @throws GeocodingUnavailableError when the provider could not be reached
   */
  geocode(address: Address): Promise<GeocodedAddress>;
}
