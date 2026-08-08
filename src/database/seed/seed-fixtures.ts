import type { Address } from '../../common/entities/address.embedded';
import type { GeoPoint } from '../../common/types/geo-point';
import { geoPoint } from '../../common/types/geo-point';

export interface CustomerFixture {
  id: string;
  email: string;
  name: string;
}

export interface ProductFixture {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
}

export interface WarehouseFixture {
  id: string;
  code: string;
  name: string;
  address: Address;
  location: GeoPoint;
  isActive: boolean;
}

export interface StockFixture {
  warehouseCode: string;
  sku: string;
  quantityOnHand: number;
}

export const CUSTOMERS: readonly CustomerFixture[] = [
  {
    id: '019fda00-0000-7000-8000-00000000c001',
    email: 'ana.silva@example.com',
    name: 'Ana Silva',
  },
  {
    id: '019fda00-0000-7000-8000-00000000c002',
    email: 'ben.okafor@example.com',
    name: 'Ben Okafor',
  },
  {
    id: '019fda00-0000-7000-8000-00000000c003',
    email: 'chen.wei@example.com',
    name: 'Chen Wei',
  },
];

export const PRODUCTS: readonly ProductFixture[] = [
  {
    id: '019fda00-0000-7000-8000-000000000a01',
    sku: 'TSHIRT-BLK-M',
    name: 'Black T-Shirt (M)',
    priceCents: 1999,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a02',
    sku: 'CAP-NVY',
    name: 'Navy Cap',
    priceCents: 2499,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a03',
    sku: 'TSHIRT-WHT-L',
    name: 'White T-Shirt (L)',
    priceCents: 1999,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a04',
    sku: 'HOODIE-GRY-L',
    name: 'Grey Hoodie (L)',
    priceCents: 4999,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a05',
    sku: 'SOCKS-WHT-3PK',
    name: 'White Socks (3-pack)',
    priceCents: 1299,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a06',
    sku: 'JEANS-BLU-32',
    name: 'Blue Jeans (32)',
    priceCents: 6999,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a07',
    sku: 'JACKET-BLK-M',
    name: 'Black Jacket (M)',
    priceCents: 12999,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a08',
    sku: 'SCARF-RED',
    name: 'Red Scarf',
    priceCents: 2299,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a09',
    sku: 'BELT-BRN-34',
    name: 'Brown Belt (34)',
    priceCents: 3499,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a10',
    sku: 'GLOVES-BLK-M',
    name: 'Black Gloves (M)',
    priceCents: 1899,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a11',
    sku: 'BEANIE-GRN',
    name: 'Green Beanie',
    priceCents: 1599,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a12',
    sku: 'LIMITED-EDT',
    name: 'Limited Edition Tee',
    priceCents: 9999,
  },
  {
    id: '019fda00-0000-7000-8000-000000000a13',
    sku: 'BACKORDER-01',
    name: 'Backordered Item',
    priceCents: 2999,
  },
];

function address(
  line1: string,
  city: string,
  region: string,
  postalCode: string,
): Address {
  return { line1, line2: null, city, region, postalCode, country: 'US' };
}

export const WAREHOUSES: readonly WarehouseFixture[] = [
  {
    id: '019fda00-0000-7000-8000-000000000b01',
    code: 'WH-NYC',
    name: 'New York City Hub',
    address: address('120 Broadway', 'New York', 'NY', '10271'),
    location: geoPoint(-74.006, 40.7128),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b02',
    code: 'WH-PHL',
    name: 'Philadelphia Distribution Center',
    address: address('1 Market Street', 'Philadelphia', 'PA', '19106'),
    location: geoPoint(-75.1652, 39.9526),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b03',
    code: 'WH-CHI',
    name: 'Chicago Distribution Center',
    address: address('233 South Wacker Drive', 'Chicago', 'IL', '60606'),
    location: geoPoint(-87.6298, 41.8781),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b04',
    code: 'WH-DEN',
    name: 'Denver Hub',
    address: address('1701 Wynkoop Street', 'Denver', 'CO', '80202'),
    location: geoPoint(-104.9903, 39.7392),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b05',
    code: 'WH-LAX',
    name: 'Los Angeles Distribution Center',
    address: address('555 West 5th Street', 'Los Angeles', 'CA', '90013'),
    location: geoPoint(-118.2437, 34.0522),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b06',
    code: 'WH-MIA',
    name: 'Miami Hub',
    address: address('200 South Biscayne Boulevard', 'Miami', 'FL', '33131'),
    location: geoPoint(-80.1918, 25.7617),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b07',
    code: 'WH-SEA',
    name: 'Seattle Hub',
    address: address('400 Broad Street', 'Seattle', 'WA', '98109'),
    location: geoPoint(-122.3321, 47.6062),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b08',
    code: 'WH-AUS',
    name: 'Austin Hub',
    address: address('98 San Jacinto Boulevard', 'Austin', 'TX', '78701'),
    location: geoPoint(-97.7431, 30.2672),
    isActive: true,
  },
  {
    id: '019fda00-0000-7000-8000-000000000b09',
    code: 'WH-RNO',
    name: 'Reno Overflow (decommissioned)',
    address: address('50 West Liberty Street', 'Reno', 'NV', '89501'),
    location: geoPoint(-119.8138, 39.5296),
    isActive: false,
  },
];

const QUANTITIES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'WH-NYC': {
    'TSHIRT-BLK-M': 40,
    'TSHIRT-WHT-L': 25,
    'SOCKS-WHT-3PK': 60,
    'BEANIE-GRN': 12,
    'LIMITED-EDT': 1,
  },
  'WH-PHL': {
    'TSHIRT-BLK-M': 120,
    'TSHIRT-WHT-L': 90,
    'CAP-NVY': 80,
    'HOODIE-GRY-L': 60,
    'SOCKS-WHT-3PK': 200,
    'JEANS-BLU-32': 45,
    'JACKET-BLK-M': 30,
    'SCARF-RED': 55,
    'BELT-BRN-34': 40,
    'GLOVES-BLK-M': 70,
    'BEANIE-GRN': 65,
  },
  'WH-CHI': {
    'TSHIRT-BLK-M': 95,
    'TSHIRT-WHT-L': 70,
    'CAP-NVY': 50,
    'HOODIE-GRY-L': 85,
    'SOCKS-WHT-3PK': 150,
    'JEANS-BLU-32': 60,
    'JACKET-BLK-M': 40,
    'SCARF-RED': 45,
    'BELT-BRN-34': 35,
    'GLOVES-BLK-M': 90,
    'BEANIE-GRN': 80,
  },
  'WH-DEN': {
    'TSHIRT-BLK-M': 30,
    'HOODIE-GRY-L': 55,
    'SOCKS-WHT-3PK': 75,
    'JACKET-BLK-M': 25,
    'SCARF-RED': 30,
    'GLOVES-BLK-M': 60,
    'BEANIE-GRN': 50,
  },
  'WH-LAX': {
    'TSHIRT-BLK-M': 110,
    'TSHIRT-WHT-L': 85,
    'CAP-NVY': 95,
    'HOODIE-GRY-L': 40,
    'SOCKS-WHT-3PK': 180,
    'JEANS-BLU-32': 70,
    'JACKET-BLK-M': 20,
    'BELT-BRN-34': 45,
    'GLOVES-BLK-M': 25,
  },
  'WH-MIA': {
    'TSHIRT-BLK-M': 75,
    'TSHIRT-WHT-L': 60,
    'CAP-NVY': 65,
    'SOCKS-WHT-3PK': 120,
    'JEANS-BLU-32': 35,
    'BELT-BRN-34': 30,
  },
  'WH-SEA': {
    'TSHIRT-BLK-M': 45,
    'TSHIRT-WHT-L': 35,
    'HOODIE-GRY-L': 70,
    'SOCKS-WHT-3PK': 90,
    'JACKET-BLK-M': 35,
    'SCARF-RED': 40,
    'GLOVES-BLK-M': 55,
    'BEANIE-GRN': 45,
  },
  'WH-AUS': {
    'TSHIRT-BLK-M': 65,
    'TSHIRT-WHT-L': 50,
    'CAP-NVY': 40,
    'SOCKS-WHT-3PK': 110,
    'JEANS-BLU-32': 40,
    'BELT-BRN-34': 25,
  },
  'WH-RNO': {
    'TSHIRT-BLK-M': 500,
    'TSHIRT-WHT-L': 500,
    'CAP-NVY': 500,
    'HOODIE-GRY-L': 500,
    'SOCKS-WHT-3PK': 500,
    'JEANS-BLU-32': 500,
    'JACKET-BLK-M': 500,
    'SCARF-RED': 500,
    'BELT-BRN-34': 500,
    'GLOVES-BLK-M': 500,
    'BEANIE-GRN': 500,
    'LIMITED-EDT': 500,
    'BACKORDER-01': 500,
  },
};

export const STOCK: readonly StockFixture[] = Object.entries(
  QUANTITIES,
).flatMap(([warehouseCode, quantities]) =>
  Object.entries(quantities).map(([sku, quantityOnHand]) => ({
    warehouseCode,
    sku,
    quantityOnHand,
  })),
);
