import 'dotenv/config';
import { closeDb, getDb } from './index.js';
import { users } from './schema/users.js';

/**
 * Sets every registered player's plasma_minerals balance to 0.
 * Re-run anytime via: npm run reset:minerals (from server/ or repo root).
 */
async function main(): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(users)
    .set({
      plasmaMinerals: 0,
      updatedAt: new Date(),
    })
    .returning({ id: users.id });

  console.log(`[db] reset plasma_minerals to 0 for ${updated.length} user(s)`);
  await closeDb();
}

main().catch((error) => {
  console.error('[db] reset:minerals failed:', error);
  process.exit(1);
});
