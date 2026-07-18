import { boolean, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Operator character catalog (face head + perk).
 * Not store items — store sells body skins separately.
 */
export const characters = pgTable('characters', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description').notNull().default(''),
  /** Longer bio for the Characters page. */
  biography: text('biography').notNull().default(''),
  /** Face head FBX under /3d/ (e.g. characters/character_garla.fbx). */
  faceModelFile: text('face_model_file').notNull(),
  /** Optional default body chassis under /3d/ (preview / fallback). */
  bodyAssetFile: text('body_asset_file'),
  perkKey: text('perk_key').notNull(),
  perkValue: integer('perk_value').notNull().default(0),
  /** Ability title. */
  perkLabel: text('perk_label').notNull().default(''),
  /** Short ability blurb. */
  perkDescription: text('perk_description').notNull().default(''),
  /** Future Characters-page unlock cost (plasma). */
  cost: integer('cost').notNull().default(0),
  defaultUnlocked: boolean('default_unlocked').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row per user — currently selected operator character. */
export const userCharacter = pgTable('user_character', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  characterId: text('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'restrict' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
