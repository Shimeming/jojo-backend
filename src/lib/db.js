import pgPromise from 'pg-promise';
import { loadEnv } from './env.js';

loadEnv();

export const pgp = pgPromise({});
export const db = pgp({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB_NAME,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});
