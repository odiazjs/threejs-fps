import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type {
  BatchUpgradeWeaponResponse,
  PlayerWeaponEntry,
  PlayerWeaponsListResponse,
  UpgradeWeaponStatResponse,
  WeaponCatalogEntry,
  WeaponsListResponse,
} from '../../../shared/api/weapons.js';
import type {
  WeaponBaseStats,
  WeaponEffectiveStats,
  WeaponUpgradeLevels,
  WeaponUpgradeStatId,
} from '../../../shared/content/weaponUpgrades.js';
import {
  WEAPON_UPGRADE_STAT_IDS,
  isWeaponUpgradeStatId,
  normalizeUpgradeLevels,
  plasmaMineralCostForLevelRange,
  plasmaMineralCostForNextLevel,
  resolveEffectiveWeaponStats,
  zeroUpgradeLevels,
} from '../../../shared/content/weaponUpgrades.js';
import type { WeaponLoadoutPresetWeapons } from '../../../shared/loadout/weaponLoadoutPreset.js';
import { assertDistinctLoadoutWeapons } from '../../../shared/loadout/weaponLoadoutPreset.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { ensureUser, getPlasmaMinerals } from '../db/users.js';
import { users } from '../db/schema/users.js';
import { userWeaponUpgrades, weapons } from '../db/schema/weapons.js';

function baseStatsFromRow(row: typeof weapons.$inferSelect): WeaponBaseStats {
  return {
    damage: row.baseDamage,
    recoil: row.baseRecoil,
    range: row.baseRange,
    magazineSize: row.baseMagazineSize,
    reloadTime: row.baseReloadSec,
    adsTime: row.baseAdsSec,
  };
}

function toCatalogEntry(row: typeof weapons.$inferSelect): WeaponCatalogEntry {
  return {
    id: row.id,
    displayName: row.displayName,
    kind: row.kind,
    loadoutEligible: row.loadoutEligible,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    baseStats: baseStatsFromRow(row),
  };
}

function levelsFromUpgradeRow(
  row: typeof userWeaponUpgrades.$inferSelect | undefined,
): WeaponUpgradeLevels {
  if (!row) return zeroUpgradeLevels();
  return normalizeUpgradeLevels({
    damage: row.damageLevel,
    recoil: row.recoilLevel,
    range: row.rangeLevel,
    magazineSize: row.magazineLevel,
    reloadTime: row.reloadLevel,
    adsTime: row.adsLevel,
  });
}

function nextUpgradeCosts(levels: WeaponUpgradeLevels): Record<WeaponUpgradeStatId, number> {
  const costs = {} as Record<WeaponUpgradeStatId, number>;
  for (const stat of WEAPON_UPGRADE_STAT_IDS) {
    costs[stat] = plasmaMineralCostForNextLevel(levels[stat]);
  }
  return costs;
}

function toPlayerWeaponEntry(
  row: typeof weapons.$inferSelect,
  upgradeRow?: typeof userWeaponUpgrades.$inferSelect,
): PlayerWeaponEntry {
  const levels = levelsFromUpgradeRow(upgradeRow);
  const baseStats = baseStatsFromRow(row);
  return {
    ...toCatalogEntry(row),
    levels,
    effectiveStats: resolveEffectiveWeaponStats(baseStats, levels),
    nextUpgradeCost: nextUpgradeCosts(levels),
  };
}

const LEVEL_COLUMN_BY_STAT: Record<
  WeaponUpgradeStatId,
  | 'damageLevel'
  | 'recoilLevel'
  | 'rangeLevel'
  | 'magazineLevel'
  | 'reloadLevel'
  | 'adsLevel'
> = {
  damage: 'damageLevel',
  recoil: 'recoilLevel',
  range: 'rangeLevel',
  magazineSize: 'magazineLevel',
  reloadTime: 'reloadLevel',
  adsTime: 'adsLevel',
};

export async function listWeapons(options?: {
  loadoutEligibleOnly?: boolean;
  enabledOnly?: boolean;
}): Promise<WeaponsListResponse> {
  const db = getDb();
  const conditions = [];
  if (options?.enabledOnly !== false) {
    conditions.push(eq(weapons.enabled, true));
  }
  if (options?.loadoutEligibleOnly) {
    conditions.push(eq(weapons.loadoutEligible, true));
  }

  const rows = await db
    .select()
    .from(weapons)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(weapons.sortOrder), asc(weapons.displayName));

  return { weapons: rows.map(toCatalogEntry) };
}

export async function listPlayerWeapons(auth: AuthContext): Promise<PlayerWeaponsListResponse> {
  await ensureUser(auth);
  const db = getDb();

  const [plasmaMinerals, rows] = await Promise.all([
    getPlasmaMinerals(auth.sub),
    db
      .select({
        weapon: weapons,
        upgrade: userWeaponUpgrades,
      })
      .from(weapons)
      .leftJoin(
        userWeaponUpgrades,
        and(
          eq(userWeaponUpgrades.weaponId, weapons.id),
          eq(userWeaponUpgrades.userId, auth.sub),
        ),
      )
      .where(eq(weapons.enabled, true))
      .orderBy(asc(weapons.sortOrder), asc(weapons.displayName)),
  ]);

  return {
    plasmaMinerals,
    weapons: rows.map(({ weapon, upgrade }) =>
      toPlayerWeaponEntry(weapon, upgrade ?? undefined),
    ),
  };
}

/**
 * Effective combat stats for every enabled weapon for a user (join-time match cache).
 * Missing upgrade rows resolve as base (level 0) stats.
 */
export async function getPlayerWeaponEffectiveStatsById(
  userId: string,
): Promise<Map<string, WeaponEffectiveStats>> {
  const db = getDb();
  const rows = await db
    .select({
      weapon: weapons,
      upgrade: userWeaponUpgrades,
    })
    .from(weapons)
    .leftJoin(
      userWeaponUpgrades,
      and(eq(userWeaponUpgrades.weaponId, weapons.id), eq(userWeaponUpgrades.userId, userId)),
    )
    .where(eq(weapons.enabled, true));

  const map = new Map<string, WeaponEffectiveStats>();
  for (const { weapon, upgrade } of rows) {
    const entry = toPlayerWeaponEntry(weapon, upgrade ?? undefined);
    map.set(entry.id, entry.effectiveStats);
  }
  return map;
}

export async function upgradePlayerWeaponStat(
  auth: AuthContext,
  weaponId: string,
  statRaw: string,
  deltaRaw: number = 1,
): Promise<UpgradeWeaponStatResponse> {
  await ensureUser(auth);

  if (!isWeaponUpgradeStatId(statRaw)) {
    throw new Error('Invalid upgrade stat');
  }
  const stat = statRaw;
  const delta = deltaRaw === -1 ? -1 : deltaRaw === 1 ? 1 : null;
  if (delta === null) {
    throw new Error('delta must be 1 or -1');
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const [weapon] = await tx.select().from(weapons).where(eq(weapons.id, weaponId)).limit(1);
    if (!weapon) {
      throw new Error('Weapon not found');
    }
    if (!weapon.enabled) {
      throw new Error('Weapon is disabled');
    }

    const [existing] = await tx
      .select()
      .from(userWeaponUpgrades)
      .where(
        and(eq(userWeaponUpgrades.userId, auth.sub), eq(userWeaponUpgrades.weaponId, weaponId)),
      )
      .limit(1);

    const levels = levelsFromUpgradeRow(existing);
    const nextLevel = levels[stat] + delta;

    if (nextLevel !== Math.floor(nextLevel) || !Number.isFinite(nextLevel)) {
      throw new Error(`${stat} level out of range`);
    }

    const unitCost = plasmaMineralCostForNextLevel(delta > 0 ? levels[stat] : nextLevel);
    if (unitCost <= 0 && delta > 0) {
      throw new Error(`Cannot upgrade ${stat}`);
    }

    let plasmaMinerals: number;
    let costSpent: number;

    if (delta > 0) {
      costSpent = unitCost;
      const [spent] = await tx
        .update(users)
        .set({
          plasmaMinerals: sql`${users.plasmaMinerals} - ${unitCost}`,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, auth.sub), sql`${users.plasmaMinerals} >= ${unitCost}`))
        .returning({ plasmaMinerals: users.plasmaMinerals });

      if (!spent) {
        throw new Error('Not enough plasma minerals');
      }
      plasmaMinerals = spent.plasmaMinerals;
    } else {
      costSpent = -unitCost;
      const [refunded] = await tx
        .update(users)
        .set({
          plasmaMinerals: sql`${users.plasmaMinerals} + ${unitCost}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, auth.sub))
        .returning({ plasmaMinerals: users.plasmaMinerals });

      if (!refunded) {
        throw new Error('Could not refund plasma minerals');
      }
      plasmaMinerals = refunded.plasmaMinerals;
    }

    const column = LEVEL_COLUMN_BY_STAT[stat];
    const now = new Date();

    let upgradeRow: typeof userWeaponUpgrades.$inferSelect;
    if (existing) {
      const [updated] = await tx
        .update(userWeaponUpgrades)
        .set({
          [column]: nextLevel,
          updatedAt: now,
        })
        .where(
          and(eq(userWeaponUpgrades.userId, auth.sub), eq(userWeaponUpgrades.weaponId, weaponId)),
        )
        .returning();
      if (!updated) {
        throw new Error('Could not update weapon upgrade');
      }
      upgradeRow = updated;
    } else {
      if (delta < 0) {
        throw new Error(`${stat} is already at base`);
      }
      const [inserted] = await tx
        .insert(userWeaponUpgrades)
        .values({
          userId: auth.sub,
          weaponId,
          [column]: nextLevel,
          updatedAt: now,
        })
        .returning();
      if (!inserted) {
        throw new Error('Could not upgrade weapon');
      }
      upgradeRow = inserted;
    }

    return {
      plasmaMinerals,
      costSpent,
      weapon: toPlayerWeaponEntry(weapon, upgradeRow),
    };
  });
}

/**
 * Apply many per-stat level deltas in one transaction (Armory SAVE UPGRADE).
 * Positive deltas spend plasma; negative deltas refund.
 */
export async function batchUpgradePlayerWeaponStats(
  auth: AuthContext,
  weaponId: string,
  deltasRaw: Partial<Record<string, number>>,
): Promise<BatchUpgradeWeaponResponse> {
  await ensureUser(auth);

  const deltas = zeroUpgradeLevels();
  let hasChange = false;
  for (const stat of WEAPON_UPGRADE_STAT_IDS) {
    const raw = deltasRaw[stat];
    if (raw === undefined || raw === null) continue;
    if (!Number.isFinite(raw)) {
      throw new Error(`Invalid delta for ${stat}`);
    }
    const delta = Math.trunc(raw);
    if (delta === 0) continue;
    deltas[stat] = delta;
    hasChange = true;
  }
  if (!hasChange) {
    throw new Error('No upgrade changes provided');
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const [weapon] = await tx.select().from(weapons).where(eq(weapons.id, weaponId)).limit(1);
    if (!weapon) {
      throw new Error('Weapon not found');
    }
    if (!weapon.enabled) {
      throw new Error('Weapon is disabled');
    }

    const [existing] = await tx
      .select()
      .from(userWeaponUpgrades)
      .where(
        and(eq(userWeaponUpgrades.userId, auth.sub), eq(userWeaponUpgrades.weaponId, weaponId)),
      )
      .limit(1);

    const currentLevels = levelsFromUpgradeRow(existing);
    const nextLevels = { ...currentLevels };
    let costSpent = 0;

    for (const stat of WEAPON_UPGRADE_STAT_IDS) {
      const delta = deltas[stat];
      if (delta === 0) continue;
      const from = currentLevels[stat];
      const to = from + delta;
      if (!Number.isFinite(to) || to !== Math.floor(to)) {
        throw new Error(`${stat} level out of range`);
      }
      nextLevels[stat] = to;
      costSpent += plasmaMineralCostForLevelRange(from, to);
    }

    let plasmaMinerals: number;
    if (costSpent > 0) {
      const [spent] = await tx
        .update(users)
        .set({
          plasmaMinerals: sql`${users.plasmaMinerals} - ${costSpent}`,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, auth.sub), sql`${users.plasmaMinerals} >= ${costSpent}`))
        .returning({ plasmaMinerals: users.plasmaMinerals });
      if (!spent) {
        throw new Error('Not enough plasma minerals');
      }
      plasmaMinerals = spent.plasmaMinerals;
    } else if (costSpent < 0) {
      const refund = -costSpent;
      const [refunded] = await tx
        .update(users)
        .set({
          plasmaMinerals: sql`${users.plasmaMinerals} + ${refund}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, auth.sub))
        .returning({ plasmaMinerals: users.plasmaMinerals });
      if (!refunded) {
        throw new Error('Could not refund plasma minerals');
      }
      plasmaMinerals = refunded.plasmaMinerals;
    } else {
      plasmaMinerals = await getPlasmaMinerals(auth.sub);
    }

    const now = new Date();
    const levelValues = {
      damageLevel: nextLevels.damage,
      recoilLevel: nextLevels.recoil,
      rangeLevel: nextLevels.range,
      magazineLevel: nextLevels.magazineSize,
      reloadLevel: nextLevels.reloadTime,
      adsLevel: nextLevels.adsTime,
      updatedAt: now,
    };

    let upgradeRow: typeof userWeaponUpgrades.$inferSelect;
    if (existing) {
      const [updated] = await tx
        .update(userWeaponUpgrades)
        .set(levelValues)
        .where(
          and(eq(userWeaponUpgrades.userId, auth.sub), eq(userWeaponUpgrades.weaponId, weaponId)),
        )
        .returning();
      if (!updated) {
        throw new Error('Could not update weapon upgrades');
      }
      upgradeRow = updated;
    } else {
      const [inserted] = await tx
        .insert(userWeaponUpgrades)
        .values({
          userId: auth.sub,
          weaponId,
          ...levelValues,
        })
        .returning();
      if (!inserted) {
        throw new Error('Could not save weapon upgrades');
      }
      upgradeRow = inserted;
    }

    return {
      plasmaMinerals,
      costSpent,
      weapon: toPlayerWeaponEntry(weapon, upgradeRow),
    };
  });
}

/**
 * Ensure both IDs exist in the catalog, are enabled, and are loadout-eligible.
 * Structural pair rules (distinct, non-empty) are applied first.
 */
export async function resolveLoadoutWeaponPair(
  primaryWeaponId: string,
  secondaryWeaponId: string,
): Promise<WeaponLoadoutPresetWeapons> {
  const pair = assertDistinctLoadoutWeapons(primaryWeaponId, secondaryWeaponId);
  const db = getDb();
  const pairRows = await db
    .select()
    .from(weapons)
    .where(inArray(weapons.id, [pair.primaryWeaponId, pair.secondaryWeaponId]));

  const map = new Map(pairRows.map((row) => [row.id, row]));

  for (const [slot, id] of [
    ['Primary', pair.primaryWeaponId],
    ['Secondary', pair.secondaryWeaponId],
  ] as const) {
    const row = map.get(id);
    if (!row) {
      throw new Error(`${slot} weapon is not in the catalog`);
    }
    if (!row.enabled) {
      throw new Error(`${slot} weapon is disabled`);
    }
    if (!row.loadoutEligible) {
      throw new Error(`${slot} weapon cannot be used in loadouts`);
    }
  }

  return pair;
}
