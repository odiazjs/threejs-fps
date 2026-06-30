import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb } from './index.js';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

async function main(): Promise<void> {
  const db = getDb();
  console.log(`[db] running migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('[db] migrations complete');
  await closeDb();
}

main().catch((error) => {
  console.error('[db] migration failed:', error);
  process.exit(1);
});
