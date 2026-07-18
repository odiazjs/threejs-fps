import { eq, inArray } from 'drizzle-orm';
import {
  DEFAULT_OPERATOR_CHARACTER_ID,
  isCharacterId,
} from '../../../shared/content/characters.js';
import { getDb } from '../db/index.js';
import { userCharacter } from '../db/schema/characters.js';

function normalizeOperatorId(raw: string | null | undefined): string {
  if (raw && isCharacterId(raw)) return raw;
  return DEFAULT_OPERATOR_CHARACTER_ID;
}

/** Ensure the user has a `user_character` row (default Garla). */
export async function ensureUserCharacter(userId: string): Promise<string> {
  const db = getDb();
  await db
    .insert(userCharacter)
    .values({
      userId,
      characterId: DEFAULT_OPERATOR_CHARACTER_ID,
    })
    .onConflictDoNothing();

  return readSelectedOperatorId(userId);
}

export async function readSelectedOperatorId(userId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ characterId: userCharacter.characterId })
    .from(userCharacter)
    .where(eq(userCharacter.userId, userId))
    .limit(1);

  return normalizeOperatorId(row?.characterId);
}

export async function readSelectedOperatorIds(
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const userId of userIds) {
    result.set(userId, DEFAULT_OPERATOR_CHARACTER_ID);
  }
  if (userIds.length === 0) return result;

  const db = getDb();
  const rows = await db
    .select({
      userId: userCharacter.userId,
      characterId: userCharacter.characterId,
    })
    .from(userCharacter)
    .where(inArray(userCharacter.userId, [...userIds]));

  for (const row of rows) {
    result.set(row.userId, normalizeOperatorId(row.characterId));
  }

  return result;
}

/** Set the user's selected operator character. */
export async function setSelectedOperatorId(
  userId: string,
  characterId: string,
): Promise<string> {
  if (!isCharacterId(characterId)) {
    throw new Error('Unknown character');
  }

  const db = getDb();
  const now = new Date();
  await db
    .insert(userCharacter)
    .values({
      userId,
      characterId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userCharacter.userId,
      set: {
        characterId,
        updatedAt: now,
      },
    });

  return characterId;
}
