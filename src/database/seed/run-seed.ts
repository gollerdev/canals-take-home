import { Logger } from '@nestjs/common';

import dataSource from '../data-source';
import { seedDatabase } from './seed';

const logger = new Logger('Seed');

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const summary = await seedDatabase(dataSource);

    logger.log(
      `Seeded ${summary.customers} customers, ${summary.products} products, ` +
        `${summary.warehouses} warehouses, ${summary.stock} stock rows`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  logger.error('Seeding failed', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
