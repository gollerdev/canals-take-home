import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface PostgresError {
  code?: string;
  table?: string;
  constraint?: string;
}

function postgresError(error: unknown): PostgresError | null {
  return error instanceof QueryFailedError
    ? (error.driverError as PostgresError)
    : null;
}

export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const pg = postgresError(error);

  if (pg?.code !== UNIQUE_VIOLATION) {
    return false;
  }

  return constraint === undefined || pg.constraint === constraint;
}

export function isForeignKeyViolation(error: unknown, table?: string): boolean {
  const pg = postgresError(error);

  if (pg?.code !== FOREIGN_KEY_VIOLATION) {
    return false;
  }

  return table === undefined || pg.table === table;
}
