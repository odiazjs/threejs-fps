import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  EquipWeaponSightResponse,
  EquippedWeaponSightsMap,
  PurchaseWeaponUnlockableResponse,
  SellWeaponUnlockableResponse,
  WeaponUnlockableState,
  WeaponUnlockablesListResponse,
} from '../../../shared/api/weaponUnlockables.js';
import { storeSellBackRefund } from '../../../shared/content/storeEconomy.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import {
  userWeaponSights,
  userWeaponUnlockables,
  weaponUnlockables,
} from '../db/schema/weaponUnlockables.js';
import { weapons } from '../db/schema/weapons.js';
import { weaponLoadouts } from '../db/schema/weaponLoadouts.js';
import { users } from '../db/schema/users.js';
import { ensureUser } from '../db/users.js';

function buildStates(
  catalog: (typeof weaponUnlockables.$inferSelect)[],
  unlockedIds: Set<string>,
): WeaponUnlockableState[] {
  return catalog.map((row) => {
    const unlocked = row.defaultUnlocked || unlockedIds.has(row.id);
    const sellable = unlocked && !row.defaultUnlocked && row.cost > 0;
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      cost: row.cost,
      unlocked,
      sellable,
      sellRefund: sellable ? storeSellBackRefund(row.cost) : 0,
      iconFile: row.iconFile,
      assetKey: row.assetKey,
      compatibleWeaponIds: [],
    };
  });
}

async function readUnlockedIds(userId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ unlockableId: userWeaponUnlockables.unlockableId })
    .from(userWeaponUnlockables)
    .where(eq(userWeaponUnlockables.userId, userId));
  return new Set(rows.map((row) => row.unlockableId));
}

async function readCatalog() {
  const db = getDb();
  return db
    .select()
    .from(weaponUnlockables)
    .where(eq(weaponUnlockables.enabled, true))
    .orderBy(asc(weaponUnlockables.sortOrder), asc(weaponUnlockables.name));
}

export async function readEquippedWeaponSights(
  userId: string,
): Promise<EquippedWeaponSightsMap> {
  const db = getDb();
  const rows = await db
    .select({
      weaponId: userWeaponSights.weaponId,
      sightId: userWeaponSights.sightId,
    })
    .from(userWeaponSights)
    .where(eq(userWeaponSights.userId, userId));

  const map: EquippedWeaponSightsMap = {};
  for (const row of rows) {
    map[row.weaponId] = row.sightId;
  }
  return map;
}

/** Keep denormalized loadout sight columns aligned with per-weapon equips. */
async function syncLoadoutSightColumns(
  userId: string,
  weaponId: string,
  sightId: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(weaponLoadouts)
    .set({ primarySightId: sightId, updatedAt: new Date() })
    .where(and(eq(weaponLoadouts.userId, userId), eq(weaponLoadouts.primaryWeaponId, weaponId)));
  await db
    .update(weaponLoadouts)
    .set({ secondarySightId: sightId, updatedAt: new Date() })
    .where(
      and(eq(weaponLoadouts.userId, userId), eq(weaponLoadouts.secondaryWeaponId, weaponId)),
    );
}

export async function listWeaponUnlockables(
  auth: AuthContext,
): Promise<WeaponUnlockablesListResponse> {
  await ensureUser(auth);
  const db = getDb();
  const [userRow] = await db
    .select({ plasmaMinerals: users.plasmaMinerals })
    .from(users)
    .where(eq(users.id, auth.sub))
    .limit(1);
  if (!userRow) throw new Error('User not found');

  const catalog = await readCatalog();
  const unlockedIds = await readUnlockedIds(auth.sub);
  const equippedSights = await readEquippedWeaponSights(auth.sub);
  return {
    plasmaMinerals: userRow.plasmaMinerals,
    unlockables: buildStates(catalog, unlockedIds),
    equippedSights,
  };
}

export async function purchaseWeaponUnlockable(
  auth: AuthContext,
  unlockableId: string,
): Promise<PurchaseWeaponUnlockableResponse> {
  await ensureUser(auth);
  const db = getDb();

  const [item] = await db
    .select()
    .from(weaponUnlockables)
    .where(and(eq(weaponUnlockables.id, unlockableId), eq(weaponUnlockables.enabled, true)))
    .limit(1);

  if (!item) throw new Error('Unknown unlockable');
  if (item.defaultUnlocked || item.cost <= 0) throw new Error('Item is already free');

  return db.transaction(async (tx) => {
    const unlocked = await tx
      .select({ unlockableId: userWeaponUnlockables.unlockableId })
      .from(userWeaponUnlockables)
      .where(
        and(
          eq(userWeaponUnlockables.userId, auth.sub),
          eq(userWeaponUnlockables.unlockableId, unlockableId),
        ),
      )
      .limit(1);

    if (unlocked.length > 0) throw new Error('Item already unlocked');

    const [spent] = await tx
      .update(users)
      .set({
        plasmaMinerals: sql`${users.plasmaMinerals} - ${item.cost}`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, auth.sub), sql`${users.plasmaMinerals} >= ${item.cost}`))
      .returning({ plasmaMinerals: users.plasmaMinerals });

    if (!spent) throw new Error('Not enough plasma minerals');

    await tx.insert(userWeaponUnlockables).values({
      userId: auth.sub,
      unlockableId,
    });

    const catalog = await tx
      .select()
      .from(weaponUnlockables)
      .where(eq(weaponUnlockables.enabled, true))
      .orderBy(asc(weaponUnlockables.sortOrder), asc(weaponUnlockables.name));
    const unlockRows = await tx
      .select({ unlockableId: userWeaponUnlockables.unlockableId })
      .from(userWeaponUnlockables)
      .where(eq(userWeaponUnlockables.userId, auth.sub));
    const unlockedIds = new Set(unlockRows.map((row) => row.unlockableId));
    const equippedRows = await tx
      .select({
        weaponId: userWeaponSights.weaponId,
        sightId: userWeaponSights.sightId,
      })
      .from(userWeaponSights)
      .where(eq(userWeaponSights.userId, auth.sub));
    const equippedSights: EquippedWeaponSightsMap = {};
    for (const row of equippedRows) equippedSights[row.weaponId] = row.sightId;

    return {
      plasmaMinerals: spent.plasmaMinerals,
      unlockableId,
      unlockables: buildStates(catalog, unlockedIds),
      equippedSights,
    };
  });
}

export async function sellWeaponUnlockable(
  auth: AuthContext,
  unlockableId: string,
): Promise<SellWeaponUnlockableResponse> {
  await ensureUser(auth);
  const db = getDb();

  const [item] = await db
    .select()
    .from(weaponUnlockables)
    .where(and(eq(weaponUnlockables.id, unlockableId), eq(weaponUnlockables.enabled, true)))
    .limit(1);

  if (!item) throw new Error('Unknown unlockable');
  if (item.defaultUnlocked || item.cost <= 0) throw new Error('Item cannot be sold back');

  const refund = storeSellBackRefund(item.cost);

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(userWeaponUnlockables)
      .where(
        and(
          eq(userWeaponUnlockables.userId, auth.sub),
          eq(userWeaponUnlockables.unlockableId, unlockableId),
        ),
      )
      .returning({ unlockableId: userWeaponUnlockables.unlockableId });

    if (deleted.length === 0) throw new Error('Item is not unlocked');

    const [credited] = await tx
      .update(users)
      .set({
        plasmaMinerals: sql`${users.plasmaMinerals} + ${refund}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.sub))
      .returning({ plasmaMinerals: users.plasmaMinerals });

    if (!credited) throw new Error('User not found');

    await tx
      .delete(userWeaponSights)
      .where(
        and(eq(userWeaponSights.userId, auth.sub), eq(userWeaponSights.sightId, unlockableId)),
      );

    await tx.execute(sql`
      UPDATE weapon_loadouts
      SET primary_sight_id = NULL,
          updated_at = NOW()
      WHERE user_id = ${auth.sub} AND primary_sight_id = ${unlockableId}
    `);
    await tx.execute(sql`
      UPDATE weapon_loadouts
      SET secondary_sight_id = NULL,
          updated_at = NOW()
      WHERE user_id = ${auth.sub} AND secondary_sight_id = ${unlockableId}
    `);

    const catalog = await tx
      .select()
      .from(weaponUnlockables)
      .where(eq(weaponUnlockables.enabled, true))
      .orderBy(asc(weaponUnlockables.sortOrder), asc(weaponUnlockables.name));
    const unlockRows = await tx
      .select({ unlockableId: userWeaponUnlockables.unlockableId })
      .from(userWeaponUnlockables)
      .where(eq(userWeaponUnlockables.userId, auth.sub));
    const unlockedIds = new Set(unlockRows.map((row) => row.unlockableId));
    const equippedRows = await tx
      .select({
        weaponId: userWeaponSights.weaponId,
        sightId: userWeaponSights.sightId,
      })
      .from(userWeaponSights)
      .where(eq(userWeaponSights.userId, auth.sub));
    const equippedSights: EquippedWeaponSightsMap = {};
    for (const row of equippedRows) equippedSights[row.weaponId] = row.sightId;

    return {
      plasmaMinerals: credited.plasmaMinerals,
      unlockableId,
      refund,
      unlockables: buildStates(catalog, unlockedIds),
      equippedSights,
    };
  });
}

export async function equipWeaponSight(
  auth: AuthContext,
  weaponId: string,
  sightId: string | null,
): Promise<EquipWeaponSightResponse> {
  await ensureUser(auth);
  const trimmedWeapon = weaponId.trim();
  if (!trimmedWeapon) throw new Error('Weapon is required');

  const db = getDb();
  const [weapon] = await db
    .select({ id: weapons.id })
    .from(weapons)
    .where(and(eq(weapons.id, trimmedWeapon), eq(weapons.enabled, true)))
    .limit(1);
  if (!weapon) throw new Error('Unknown weapon');

  if (sightId) {
    await assertSightEquippable(auth.sub, sightId, trimmedWeapon);
    await db
      .insert(userWeaponSights)
      .values({
        userId: auth.sub,
        weaponId: trimmedWeapon,
        sightId,
        equippedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userWeaponSights.userId, userWeaponSights.weaponId],
        set: { sightId, equippedAt: new Date() },
      });
  } else {
    await db
      .delete(userWeaponSights)
      .where(
        and(
          eq(userWeaponSights.userId, auth.sub),
          eq(userWeaponSights.weaponId, trimmedWeapon),
        ),
      );
  }

  await syncLoadoutSightColumns(auth.sub, trimmedWeapon, sightId);

  return {
    weaponId: trimmedWeapon,
    sightId,
    equippedSights: await readEquippedWeaponSights(auth.sub),
  };
}

export async function assertSightEquippable(
  userId: string,
  sightId: string | null | undefined,
  _weaponId: string,
): Promise<string | null> {
  if (!sightId) return null;

  const db = getDb();
  const [item] = await db
    .select()
    .from(weaponUnlockables)
    .where(
      and(
        eq(weaponUnlockables.id, sightId),
        eq(weaponUnlockables.enabled, true),
        eq(weaponUnlockables.type, 'sight'),
      ),
    )
    .limit(1);

  if (!item) throw new Error('Unknown sight');

  if (item.defaultUnlocked) return item.id;

  const unlocked = await db
    .select({ unlockableId: userWeaponUnlockables.unlockableId })
    .from(userWeaponUnlockables)
    .where(
      and(
        eq(userWeaponUnlockables.userId, userId),
        eq(userWeaponUnlockables.unlockableId, sightId),
      ),
    )
    .limit(1);

  if (unlocked.length === 0) throw new Error('Sight is not unlocked');
  return item.id;
}
