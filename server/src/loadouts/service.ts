import { and, asc, eq, ne } from 'drizzle-orm';
import type {
  CreateWeaponLoadoutRequest,
  UpdateWeaponLoadoutRequest,
  WeaponLoadoutMutationResponse,
  WeaponLoadoutSummary,
  WeaponLoadoutsListResponse,
} from '../../../shared/api/loadouts.js';
import type { WeaponLoadoutPresetWeapons } from '../../../shared/loadout/weaponLoadoutPreset.js';
import {
  WEAPON_LOADOUT_MAX_PER_USER,
  validateWeaponLoadoutName,
} from '../../../shared/loadout/weaponLoadoutPreset.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { weaponLoadouts } from '../db/schema/weaponLoadouts.js';
import { ensureUser } from '../db/users.js';
import { resolveLoadoutWeaponPair } from '../weapons/service.js';

function toSummary(row: typeof weaponLoadouts.$inferSelect): WeaponLoadoutSummary {
  return {
    id: row.id,
    name: row.name,
    primaryWeaponId: row.primaryWeaponId,
    secondaryWeaponId: row.secondaryWeaponId,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listOwnedLoadouts(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(weaponLoadouts)
    .where(eq(weaponLoadouts.userId, userId))
    .orderBy(asc(weaponLoadouts.createdAt));
}

async function findOwnedLoadout(userId: string, loadoutId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(weaponLoadouts)
    .where(and(eq(weaponLoadouts.id, loadoutId), eq(weaponLoadouts.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function clearDefaultFlag(userId: string, exceptId?: string): Promise<void> {
  const db = getDb();
  const whereClause = exceptId
    ? and(eq(weaponLoadouts.userId, userId), ne(weaponLoadouts.id, exceptId))
    : eq(weaponLoadouts.userId, userId);

  await db
    .update(weaponLoadouts)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(whereClause);
}

/** Ensure exactly one default among remaining loadouts when needed. */
async function promoteDefaultIfNeeded(userId: string, preferredId?: string): Promise<void> {
  const rows = await listOwnedLoadouts(userId);
  if (rows.length === 0) return;

  const preferred = preferredId ? rows.find((row) => row.id === preferredId) : undefined;
  const currentDefault = rows.find((row) => row.isDefault);
  if (currentDefault && !preferred) return;

  const nextDefault = preferred ?? rows[0]!;
  if (currentDefault?.id === nextDefault.id) return;

  const db = getDb();
  await clearDefaultFlag(userId);
  await db
    .update(weaponLoadouts)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(weaponLoadouts.id, nextDefault.id));
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  if (code === '23505') return true;
  const message = 'message' in error ? String((error as { message?: unknown }).message) : '';
  return message.includes('unique') || message.includes('weapon_loadouts_user_name_uidx');
}

function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  return code === '23503';
}

export async function listWeaponLoadouts(auth: AuthContext): Promise<WeaponLoadoutsListResponse> {
  await ensureUser(auth);
  const rows = await listOwnedLoadouts(auth.sub);
  return { loadouts: rows.map(toSummary) };
}

export async function createWeaponLoadout(
  auth: AuthContext,
  input: CreateWeaponLoadoutRequest,
): Promise<WeaponLoadoutMutationResponse> {
  await ensureUser(auth);
  const name = validateWeaponLoadoutName(input.name);
  const pair = await resolveLoadoutWeaponPair(input.primaryWeaponId, input.secondaryWeaponId);

  const existing = await listOwnedLoadouts(auth.sub);
  if (existing.length >= WEAPON_LOADOUT_MAX_PER_USER) {
    throw new Error(`You can save at most ${WEAPON_LOADOUT_MAX_PER_USER} loadouts`);
  }

  // First saved loadout is always the default, even if the client omits the flag.
  const makeDefault = existing.length === 0 || input.isDefault === true;
  const db = getDb();

  if (makeDefault && existing.length > 0) {
    await clearDefaultFlag(auth.sub);
  }

  try {
    const [row] = await db
      .insert(weaponLoadouts)
      .values({
        userId: auth.sub,
        name,
        primaryWeaponId: pair.primaryWeaponId,
        secondaryWeaponId: pair.secondaryWeaponId,
        isDefault: makeDefault,
      })
      .returning();

    if (!row) {
      throw new Error('Could not create loadout');
    }

    return { loadout: toSummary(row) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('A loadout with that name already exists');
    }
    if (isForeignKeyViolation(error)) {
      throw new Error('Primary or secondary weapon is not in the catalog');
    }
    throw error;
  }
}

export async function updateWeaponLoadout(
  auth: AuthContext,
  loadoutId: string,
  input: UpdateWeaponLoadoutRequest,
): Promise<WeaponLoadoutMutationResponse> {
  await ensureUser(auth);
  const existing = await findOwnedLoadout(auth.sub, loadoutId);
  if (!existing) {
    throw new Error('Loadout not found');
  }

  const nextName =
    input.name !== undefined ? validateWeaponLoadoutName(input.name) : existing.name;
  const nextPrimary =
    input.primaryWeaponId !== undefined ? input.primaryWeaponId : existing.primaryWeaponId;
  const nextSecondary =
    input.secondaryWeaponId !== undefined
      ? input.secondaryWeaponId
      : existing.secondaryWeaponId;
  const pair = await resolveLoadoutWeaponPair(nextPrimary, nextSecondary);
  const makeDefault = input.isDefault === true;
  const clearDefault = input.isDefault === false && existing.isDefault;

  if (makeDefault) {
    await clearDefaultFlag(auth.sub, loadoutId);
  }

  const db = getDb();
  try {
    const [row] = await db
      .update(weaponLoadouts)
      .set({
        name: nextName,
        primaryWeaponId: pair.primaryWeaponId,
        secondaryWeaponId: pair.secondaryWeaponId,
        ...(makeDefault ? { isDefault: true } : {}),
        ...(clearDefault ? { isDefault: false } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(weaponLoadouts.id, loadoutId), eq(weaponLoadouts.userId, auth.sub)))
      .returning();

    if (!row) {
      throw new Error('Loadout not found');
    }

    if (clearDefault) {
      await promoteDefaultIfNeeded(auth.sub);
      const refreshed = await findOwnedLoadout(auth.sub, loadoutId);
      return { loadout: toSummary(refreshed ?? row) };
    }

    return { loadout: toSummary(row) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('A loadout with that name already exists');
    }
    if (isForeignKeyViolation(error)) {
      throw new Error('Primary or secondary weapon is not in the catalog');
    }
    throw error;
  }
}

export async function setDefaultWeaponLoadout(
  auth: AuthContext,
  loadoutId: string,
): Promise<WeaponLoadoutMutationResponse> {
  return updateWeaponLoadout(auth, loadoutId, { isDefault: true });
}

export async function deleteWeaponLoadout(
  auth: AuthContext,
  loadoutId: string,
): Promise<{ success: true }> {
  await ensureUser(auth);
  const existing = await findOwnedLoadout(auth.sub, loadoutId);
  if (!existing) {
    throw new Error('Loadout not found');
  }

  const db = getDb();
  await db
    .delete(weaponLoadouts)
    .where(and(eq(weaponLoadouts.id, loadoutId), eq(weaponLoadouts.userId, auth.sub)));

  if (existing.isDefault) {
    await promoteDefaultIfNeeded(auth.sub);
  }

  return { success: true };
}

/** Used by match rooms to equip a player's saved default on spawn. */
export async function getDefaultWeaponLoadoutWeapons(
  userId: string,
): Promise<WeaponLoadoutPresetWeapons | null> {
  const db = getDb();
  const [row] = await db
    .select({
      primaryWeaponId: weaponLoadouts.primaryWeaponId,
      secondaryWeaponId: weaponLoadouts.secondaryWeaponId,
    })
    .from(weaponLoadouts)
    .where(and(eq(weaponLoadouts.userId, userId), eq(weaponLoadouts.isDefault, true)))
    .limit(1);

  if (!row) return null;

  try {
    return await resolveLoadoutWeaponPair(row.primaryWeaponId, row.secondaryWeaponId);
  } catch {
    return null;
  }
}

/** Used by match rooms when a player switches a saved Armory loadout mid-match. */
export async function getWeaponLoadoutWeaponsById(
  userId: string,
  loadoutId: string,
): Promise<WeaponLoadoutPresetWeapons | null> {
  const row = await findOwnedLoadout(userId, loadoutId);
  if (!row) return null;

  try {
    return await resolveLoadoutWeaponPair(row.primaryWeaponId, row.secondaryWeaponId);
  } catch {
    return null;
  }
}
