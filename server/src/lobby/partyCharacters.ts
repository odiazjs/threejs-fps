import { and, eq, inArray } from 'drizzle-orm';
import { DEFAULT_CHARACTER_ITEM_ID } from '../../../shared/content/storeItemTypes.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { weaponLoadouts } from '../db/schema/weaponLoadouts.js';

export const FALLBACK_PARTY_PRIMARY_WEAPON_ID = 'plasma_rifle';

export interface PartyMemberCosmetics {
  selectedCharacterId: string;
  primaryWeaponId: string;
}

/** Load equipped character + default primary weapon for party snapshot members. */
export async function readPartyMemberCosmetics(
  userIds: readonly string[],
): Promise<Map<string, PartyMemberCosmetics>> {
  const result = new Map<string, PartyMemberCosmetics>();
  if (userIds.length === 0) return result;

  for (const userId of userIds) {
    result.set(userId, {
      selectedCharacterId: DEFAULT_CHARACTER_ITEM_ID,
      primaryWeaponId: FALLBACK_PARTY_PRIMARY_WEAPON_ID,
    });
  }

  const db = getDb();
  const [userRows, loadoutRows] = await Promise.all([
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
  ]);

  for (const row of userRows) {
    const current = result.get(row.id)!;
    current.selectedCharacterId = row.selectedCharacterId || DEFAULT_CHARACTER_ITEM_ID;
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
