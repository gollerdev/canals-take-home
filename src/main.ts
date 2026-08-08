import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configureApp } from './common/http/configure-app';
import { SWAGGER_PATH, setupSwagger } from './common/http/swagger';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  configureApp(app);
  setupSwagger(app);

  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port, '0.0.0.0');

  Logger.log(`Listening on port ${port}`, 'Bootstrap');
  Logger.log(`API reference at /${SWAGGER_PATH}`, 'Bootstrap');
}

void bootstrap();
