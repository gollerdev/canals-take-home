import type { DataSource, EntityManager, ObjectLiteral } from 'typeorm';

import { Customer } from '../../customers/entities/customer.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { Warehouse } from '../../inventory/entities/warehouse.entity';
import { Product } from '../../products/entities/product.entity';
import { CUSTOMERS, PRODUCTS, STOCK, WAREHOUSES } from './seed-fixtures';

export interface SeedSummary {
  customers: number;
  products: number;
  warehouses: number;
  stock: number;
}

async function insertMissing<T extends ObjectLiteral>(
  manager: EntityManager,
  target: new () => T,
  values: readonly Partial<T>[],
): Promise<void> {
  await manager
    .createQueryBuilder()
    .insert()
    .into(target)
    .values(values as Partial<T>[])
    .orIgnore()
    .execute();
}

function byKey<T, K extends keyof T>(rows: readonly T[], key: K): Map<T[K], T> {
  return new Map(rows.map((row) => [row[key], row]));
}

/**
 * Inserts the reference data the API needs to serve orders.
 *
 * Existing rows are left untouched, so re-running never resets live stock.
 *
 * @param dataSource - connection to seed through
 * @returns the row count of each seeded table
 */
export async function seedDatabase(
  dataSource: DataSource,
): Promise<SeedSummary> {
  await dataSource.transaction(async (manager) => {
    await insertMissing(manager, Customer, CUSTOMERS);
    await insertMissing(manager, Product, PRODUCTS);
    await insertMissing(manager, Warehouse, WAREHOUSES);

    const warehouses = byKey(await manager.find(Warehouse), 'code');
    const products = byKey(await manager.find(Product), 'sku');

    const stock = STOCK.map((item) => ({
      warehouseId: warehouses.get(item.warehouseCode)?.id,
      productId: products.get(item.sku)?.id,
      quantityOnHand: item.quantityOnHand,
      quantityReserved: 0,
    })).filter((item) => item.warehouseId && item.productId);

    await insertMissing(manager, InventoryItem, stock);
  });

  const [customers, products, warehouses, stock] = await Promise.all([
    dataSource.manager.count(Customer),
    dataSource.manager.count(Product),
    dataSource.manager.count(Warehouse),
    dataSource.manager.count(InventoryItem),
  ]);

  return { customers, products, warehouses, stock };
}
