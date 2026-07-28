import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const playerStats = pgTable(
  'player_stats',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    matchesPlayed: integer('matches_played').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    /** Career account XP (drives profile level). */
    xp: integer('xp').notNull().default(0),
    /** Denormalized account level from {@link xp}. */
    level: integer('level').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('player_stats_kills_idx').on(table.kills),
    index('player_stats_wins_idx').on(table.wins),
    index('player_stats_level_idx').on(table.level),
  ],
);
