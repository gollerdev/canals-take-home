process.env.NODE_ENV = 'test';
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5433';
process.env.DB_USERNAME ??= 'canals';
process.env.DB_PASSWORD ??= 'canals';
process.env.DB_DATABASE = process.env.TEST_DB_DATABASE ?? 'canals_orders_test';
process.env.PAYMENT_MOCK_LATENCY_MS ??= '0';
process.env.GEOCODING_MOCK_LATENCY_MS ??= '0';
