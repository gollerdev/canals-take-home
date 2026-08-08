import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { DomainExceptionFilter } from './domain-exception.filter';

/**
 * Applies the HTTP behaviour the application depends on.
 *
 * Shared by the bootstrap and the end-to-end tests so the two cannot drift.
 *
 * @param app - the Nest application to configure
 */
export function configureApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');

  app.useGlobalFilters(new DomainExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
