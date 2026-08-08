export class AddressNotGeocodableError extends Error {
  constructor(readonly formattedAddress: string) {
    super(`No location found for "${formattedAddress}"`);
    this.name = 'AddressNotGeocodableError';
  }
}

export class GeocodingUnavailableError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'GeocodingUnavailableError';
  }
}
