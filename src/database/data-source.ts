import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';

import { validateEnv } from '../config/env.schema';
import { buildDataSourceOptions } from './data-source.options';

loadDotenv();

export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
