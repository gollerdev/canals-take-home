import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

/**
 * Mounts the interactive API reference at `/docs`.
 *
 * @param app - the Nest application to document
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Orders API')
    .setDescription(
      'Places orders against the closest warehouse that can fill them, and charges the card. ' +
        'Every POST /orders requires an `Idempotency-Key` header.',
    )
    .setVersion('0.1.0')
    .addTag('orders', 'Placing and reading orders')
    .addTag('health', 'Liveness and database connectivity')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });
}
