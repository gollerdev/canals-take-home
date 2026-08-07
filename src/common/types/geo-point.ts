export interface GeoPoint {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
}

export function geoPoint(longitude: number, latitude: number): GeoPoint {
  return { type: 'Point', coordinates: [longitude, latitude] };
}
