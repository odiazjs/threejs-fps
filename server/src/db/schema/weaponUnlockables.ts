import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { weapons } from './weapons.js';

/**
 * Catalog of per-weapon unlockables (sights, etc.).
 * Ownership lives in `user_weapon_unlockables`.
 */
export const weaponUnlockables = pgTable('weapon_unlockables', {
  id: text('id').primaryKey(),
  /** e.g. sight */
  type: text('type').notNull(),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description').notNull().default(''),
  /** Plasma mineral cost; 0 = free. */
  cost: integer('cost').notNull().default(0),
  defaultUnlocked: boolean('default_unlocked').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Preview / reticle image under /images/ (e.g. weapons/red_dot_1.png). */
  iconFile: text('icon_file'),
  /** Client asset key for mounting (e.g. red_dot_1). */
  assetKey: text('asset_key'),
  /**
   * Reserved. Sights are universal (any weapon).
   * Equipped optic per weapon lives in `user_weapon_sights`.
   */
  compatibleWeaponIds: text('compatible_weapon_ids'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Purchased unlockables owned by a player. */
export const userWeaponUnlockables = pgTable(
  'user_weapon_unlockables',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    unlockableId: text('unlockable_id')
      .notNull()
      .references(() => weaponUnlockables.id, { onDelete: 'cascade' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.unlockableId] })],
);

/**
 * Per-user equipped sight for each weapon id.
 * Source of truth for which optic is mounted on a gun after reload.
 */
export const userWeaponSights = pgTable(
  'user_weapon_sights',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weaponId: text('weapon_id')
      .notNull()
      .references(() => weapons.id, { onDelete: 'cascade' }),
    sightId: text('sight_id')
      .notNull()
      .references(() => weaponUnlockables.id, { onDelete: 'cascade' }),
    equippedAt: timestamp('equipped_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.weaponId] })],
);
