import 'dotenv/config';
import { ne, sql } from 'drizzle-orm';
import { DEFAULT_OPERATOR_CHARACTER_ID } from '../../../shared/content/characters.js';
import { DEFAULT_CHARACTER_ITEM_ID } from '../../../shared/content/storeItemTypes.js';
import { closeDb, getDb } from './index.js';
import { userCharacter, userOperatorUnlocks } from './schema/characters.js';
import { userStoreUnlocks } from './schema/storeItems.js';
import { users } from './schema/users.js';

/**
 * Clears every player's store unlocks + season-gated operator unlocks,
 * resets equipped skin/operator to defaults, and clears matching season claims
 * so earned season rewards can re-grant on next sync.
 *
 * Re-run anytime via: npm run reset:unlocks (from server/ or repo root).
 */
async function main(): Promise<void> {
  const db = getDb();

  const storeDeleted = await db.delete(userStoreUnlocks).returning({
    userId: userStoreUnlocks.userId,
    itemId: userStoreUnlocks.itemId,
  });

  const operatorDeleted = await db.delete(userOperatorUnlocks).returning({
    userId: userOperatorUnlocks.userId,
    characterId: userOperatorUnlocks.characterId,
  });

  const claimsResult = await db.execute(sql`
    DELETE FROM "user_season_reward_claims"
    WHERE ("season_id", "level") IN (
      SELECT "season_id", "level"
      FROM "season_rewards"
      WHERE "reward_type" IN ('character', 'character_skin')
    )
    RETURNING "user_id"
  `);
  const claimsDeleted = Array.isArray(claimsResult)
    ? claimsResult.length
    : ((claimsResult as { rowCount?: number }).rowCount ?? 0);

  const skinsReset = await db
    .update(users)
    .set({
      selectedCharacterId: DEFAULT_CHARACTER_ITEM_ID,
      updatedAt: new Date(),
    })
    .where(ne(users.selectedCharacterId, DEFAULT_CHARACTER_ITEM_ID))
    .returning({ id: users.id });

  const operatorsReset = await db
    .update(userCharacter)
    .set({
      characterId: DEFAULT_OPERATOR_CHARACTER_ID,
      updatedAt: new Date(),
    })
    .where(ne(userCharacter.characterId, DEFAULT_OPERATOR_CHARACTER_ID))
    .returning({ userId: userCharacter.userId });

  console.log(
    `[db] reset unlocks: removed ${storeDeleted.length} store unlock(s), ` +
      `${operatorDeleted.length} operator unlock(s), ${claimsDeleted} season claim(s); ` +
      `reset ${skinsReset.length} skin selection(s), ${operatorsReset.length} operator selection(s)`,
  );
  await closeDb();
}

main().catch((error) => {
  console.error('[db] reset:unlocks failed:', error);
  process.exit(1);
});
