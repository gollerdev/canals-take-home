import { Injectable } from '@nestjs/common';

import { Product } from './entities/product.entity';
import { UnknownProductsError } from './exceptions/unknown-products.exception';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductsRepository) {}

  /**
   * Loads every requested product, failing if any id is unknown.
   *
   * @param ids - product identifiers the order refers to, in any case
   * @returns the products, keyed by lowercase id
   * @throws UnknownProductsError naming the ids that do not exist
   */
  async requireAll(ids: readonly string[]): Promise<Map<string, Product>> {
    const wanted = ids.map((id) => id.toLowerCase());
    const found = await this.products.findByIds(wanted);
    const byId = new Map(
      found.map((product) => [product.id.toLowerCase(), product]),
    );
    const missing = wanted.filter((id) => !byId.has(id));

    if (missing.length > 0) {
      throw new UnknownProductsError(missing);
    }

    return byId;
  }
}
