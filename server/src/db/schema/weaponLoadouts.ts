import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { weapons } from './weapons.js';
import { weaponUnlockables } from './weaponUnlockables.js';

/** Named primary + secondary weapon presets owned by a player. */
export const weaponLoadouts = pgTable(
  'weapon_loadouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 24 }).notNull(),
    primaryWeaponId: text('primary_weapon_id')
      .notNull()
      .references(() => weapons.id, { onDelete: 'restrict' }),
    secondaryWeaponId: text('secondary_weapon_id')
      .notNull()
      .references(() => weapons.id, { onDelete: 'restrict' }),
    /** Equipped sight on the primary weapon (`weapon_unlockables.id`), null = none. */
    primarySightId: text('primary_sight_id').references(() => weaponUnlockables.id, {
      onDelete: 'set null',
    }),
    /** Equipped sight on the secondary weapon. */
    secondarySightId: text('secondary_sight_id').references(() => weaponUnlockables.id, {
      onDelete: 'set null',
    }),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('weapon_loadouts_user_id_idx').on(table.userId),
    uniqueIndex('weapon_loadouts_user_name_uidx').on(table.userId, table.name),
    uniqueIndex('weapon_loadouts_user_default_uidx')
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);
