import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { Product } from './entities/product.entity';

@Injectable()
export class ProductsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Loads the given products, omitting ids that do not exist.
   *
   * @param ids - product identifiers to load
   * @returns the products that were found, in no guaranteed order
   */
  async findByIds(ids: readonly string[]): Promise<Product[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.dataSource.manager.find(Product, {
      where: { id: In([...ids]) },
    });
  }
}
