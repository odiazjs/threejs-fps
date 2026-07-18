import { boolean, integer, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Authoritative store catalog (characters, skins, attachments, etc.).
 * Per-player unlocks live in `user_store_unlocks`.
 */
export const storeItems = pgTable('store_items', {
  id: text('id').primaryKey(),
  /** e.g. new_weapon | weapon_skin | character_skin | new_character | attachment */
  type: text('type').notNull(),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description').notNull().default(''),
  /** Plasma mineral cost; 0 = free. */
  cost: integer('cost').notNull().default(0),
  /** When true, every player owns this item without a unlock row. */
  defaultUnlocked: boolean('default_unlocked').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Optional body chassis path under /3d/ (e.g. character mesh FBX). */
  assetFile: text('asset_file'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Purchased / granted store items owned by a player. */
export const userStoreUnlocks = pgTable(
  'user_store_unlocks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => storeItems.id, { onDelete: 'cascade' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
  ],
);
