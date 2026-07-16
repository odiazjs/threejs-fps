import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/** Cognito `sub` is the primary key. */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: varchar('display_name', { length: 16 }).notNull(),
  /** Spendable in-game currency for weapon upgrades. */
  plasmaMinerals: integer('plasma_minerals').notNull().default(0),
  /** Equipped store character item id (`store_items` with type new_character / character_skin). */
  selectedCharacterId: text('selected_character_id').notNull().default('basic'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});
