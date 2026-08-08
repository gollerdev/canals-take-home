import { Module } from '@nestjs/common';

import { GEOCODING_PROVIDER } from './geocoding-provider.interface';
import { MockGeocodingProvider } from './mock-geocoding.provider';

@Module({
  providers: [{ provide: GEOCODING_PROVIDER, useClass: MockGeocodingProvider }],
  exports: [GEOCODING_PROVIDER],
})
export class GeocodingModule {}
