import { and, eq, inArray } from 'drizzle-orm';
import { DEFAULT_OPERATOR_CHARACTER_ID } from '../../../shared/content/characters.js';
import { DEFAULT_CHARACTER_ITEM_ID } from '../../../shared/content/storeItemTypes.js';
import { readSelectedOperatorIds } from '../characters/userCharacter.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { weaponLoadouts } from '../db/schema/weaponLoadouts.js';

export const FALLBACK_PARTY_PRIMARY_WEAPON_ID = 'plasma_rifle';

export interface PartyMemberCosmetics {
  /** Equipped store body skin id. */
  selectedCharacterId: string;
  /** Selected operator character id (face + perk). */
  selectedOperatorId: string;
  primaryWeaponId: string;
}

/** Load equipped skin + operator + default primary for party snapshot members. */
export async function readPartyMemberCosmetics(
  userIds: readonly string[],
): Promise<Map<string, PartyMemberCosmetics>> {
  const result = new Map<string, PartyMemberCosmetics>();
  if (userIds.length === 0) return result;

  for (const userId of userIds) {
    result.set(userId, {
      selectedCharacterId: DEFAULT_CHARACTER_ITEM_ID,
      selectedOperatorId: DEFAULT_OPERATOR_CHARACTER_ID,
      primaryWeaponId: FALLBACK_PARTY_PRIMARY_WEAPON_ID,
    });
  }

  const db = getDb();
  const [userRows, loadoutRows, operatorIds] = await Promise.all([
    db
      .select({
        id: users.id,
        selectedCharacterId: users.selectedCharacterId,
      })
      .from(users)
      .where(inArray(users.id, [...userIds])),
    db
      .select({
        userId: weaponLoadouts.userId,
        primaryWeaponId: weaponLoadouts.primaryWeaponId,
      })
      .from(weaponLoadouts)
      .where(
        and(inArray(weaponLoadouts.userId, [...userIds]), eq(weaponLoadouts.isDefault, true)),
      ),
    readSelectedOperatorIds(userIds),
  ]);

  for (const row of userRows) {
    const current = result.get(row.id)!;
    current.selectedCharacterId = row.selectedCharacterId || DEFAULT_CHARACTER_ITEM_ID;
    current.selectedOperatorId =
      operatorIds.get(row.id) ?? DEFAULT_OPERATOR_CHARACTER_ID;
  }

  for (const row of loadoutRows) {
    const current = result.get(row.userId);
    if (!current) continue;
    const primary = row.primaryWeaponId?.trim();
    if (primary) {
      current.primaryWeaponId = primary;
    }
  }

  return result;
}

/** @deprecated Prefer readPartyMemberCosmetics. */
export async function readSelectedCharacterIds(
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const cosmetics = await readPartyMemberCosmetics(userIds);
  const result = new Map<string, string>();
  for (const [userId, entry] of cosmetics) {
    result.set(userId, entry.selectedCharacterId);
  }
  return result;
}
