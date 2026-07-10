import { boolean, doublePrecision, integer, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { weaponKindEnum } from './enums.js';
import { users } from './users.js';

/**
 * Authoritative weapon catalog + base combat stats.
 * Per-player upgrade levels live in `user_weapon_upgrades`.
 */
export const weapons = pgTable('weapons', {
  id: text('id').primaryKey(),
  displayName: varchar('display_name', { length: 32 }).notNull(),
  kind: weaponKindEnum('kind').notNull(),
  /** When true, weapon may be chosen as primary/secondary on a loadout. */
  loadoutEligible: boolean('loadout_eligible').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  baseDamage: doublePrecision('base_damage').notNull().default(0),
  /** Recoil intensity 0–100 (higher = more kick). */
  baseRecoil: doublePrecision('base_recoil').notNull().default(0),
  baseRange: doublePrecision('base_range').notNull().default(0),
  baseMagazineSize: integer('base_magazine_size').notNull().default(1),
  baseReloadSec: doublePrecision('base_reload_sec').notNull().default(0),
  baseAdsSec: doublePrecision('base_ads_sec').notNull().default(0),
  /** Shots (or melee swings) per second. */
  baseFireRate: doublePrecision('base_fire_rate').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per-player upgrade levels (0–max) for each upgradable weapon stat. */
export const userWeaponUpgrades = pgTable(
  'user_weapon_upgrades',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weaponId: text('weapon_id')
      .notNull()
      .references(() => weapons.id, { onDelete: 'cascade' }),
    damageLevel: integer('damage_level').notNull().default(0),
    recoilLevel: integer('recoil_level').notNull().default(0),
    rangeLevel: integer('range_level').notNull().default(0),
    magazineLevel: integer('magazine_level').notNull().default(0),
    reloadLevel: integer('reload_level').notNull().default(0),
    adsLevel: integer('ads_level').notNull().default(0),
    fireRateLevel: integer('fire_rate_level').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.weaponId] })],
);
