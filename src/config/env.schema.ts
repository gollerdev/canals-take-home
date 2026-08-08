import * as Joi from 'joi';

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_DATABASE: string;
  DB_POOL_SIZE: number;
  PAYMENT_MOCK_LATENCY_MS: number;
  GEOCODING_MOCK_LATENCY_MS: number;
}

const schema = Joi.object<Env>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.string().min(1).required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().min(1).required(),
  DB_PASSWORD: Joi.string().min(1).required(),
  DB_DATABASE: Joi.string().min(1).required(),
  DB_POOL_SIZE: Joi.number().integer().min(1).default(10),
  PAYMENT_MOCK_LATENCY_MS: Joi.number().integer().min(0).default(250),
  GEOCODING_MOCK_LATENCY_MS: Joi.number().integer().min(0).default(120),
}).unknown(true);

export function validateEnv(source: Record<string, unknown>): Env {
  const result = schema.validate(source, {
    abortEarly: false,
    convert: true,
  });

  if (result.error) {
    const details = result.error.details
      .map((d) => `  - ${d.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.value;
}
