import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { resolveDatabaseUrl, shouldUseSsl } from './config.js';
import * as schema from './schema/index.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = resolveDatabaseUrl();
    const ssl = shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined;
    pool = new Pool({ connectionString, ssl });
  }
  return pool;
}

export function getDb() {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

export async function connectDb(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('select 1');
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

export type Database = ReturnType<typeof getDb>;
