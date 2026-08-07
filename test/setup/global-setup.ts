import { DataSource } from 'typeorm';

import { TEST_DATABASE, testDataSourceOptions } from './test-data-source';

function describeCause(cause: unknown): string {
  if (cause instanceof AggregateError) {
    return cause.errors
      .map((inner: unknown) =>
        inner instanceof Error ? inner.message : String(inner),
      )
      .join('; ');
  }

  return cause instanceof Error ? cause.message : String(cause);
}

async function connectOrExplain(dataSource: DataSource): Promise<DataSource> {
  try {
    return await dataSource.initialize();
  } catch (cause) {
    const { host, port } = dataSource.options as {
      host: string;
      port: number;
    };

    throw new Error(
      `Cannot reach Postgres at ${host}:${port}.\n` +
        `Integration tests need the database running. Start it with:\n\n` +
        `    docker compose up -d db\n\n` +
        `Original error: ${describeCause(cause)}`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  const admin = await connectOrExplain(
    new DataSource(testDataSourceOptions('postgres')),
  );

  try {
    const existing = await admin.query<unknown[]>(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [TEST_DATABASE],
    );

    if (existing.length === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    }
  } finally {
    await admin.destroy();
  }

  const target = await connectOrExplain(
    new DataSource(testDataSourceOptions()),
  );

  try {
    await target.runMigrations();
  } finally {
    await target.destroy();
  }
}
