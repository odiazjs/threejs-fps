import 'dotenv/config';
import { closeDb } from '../index.js';
import { upsertCurrentWeaponCatalog } from './upsertWeapons.js';

async function main(): Promise<void> {
  await upsertCurrentWeaponCatalog();
  console.log('[db] weapon catalog upserted');
  await closeDb();
}

main().catch((error) => {
  console.error('[db] weapon catalog upsert failed:', error);
  process.exit(1);
});
