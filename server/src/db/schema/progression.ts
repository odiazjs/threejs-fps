import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** Canonical competitive rank ladder + RP thresholds (seeded catalog). */
export const ranks = pgTable(
  'ranks',
  {
    id: text('id').primaryKey(),
    tier: text('tier').notNull(),
    division: integer('division').notNull(),
    name: text('name').notNull(),
    /** Inclusive minimum RP required for this rank. */
    minRp: integer('min_rp').notNull(),
    sortOrder: integer('sort_order').notNull(),
    /** Optional crest / badge asset key for UI. */
    iconKey: text('icon_key'),
    enabled: boolean('enabled').notNull().default(true),
  },
  (table) => [
    uniqueIndex('ranks_tier_division_uidx').on(table.tier, table.division),
    index('ranks_sort_idx').on(table.sortOrder),
    index('ranks_min_rp_idx').on(table.minRp),
  ],
);

/** Competitive / battle-pass season window. */
export const seasons = pgTable(
  'seasons',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('seasons_active_idx').on(table.isActive)],
);

/** Per-user stats scoped to one season (RP, streaks, battle-pass XP). */
export const seasonPlayerStats = pgTable(
  'season_player_stats',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seasonId: text('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    /** Current ranked points (can go down on losses). */
    rp: integer('rp').notNull().default(0),
    /** Highest RP reached this season. */
    peakRp: integer('peak_rp').notNull().default(0),
    /** Sum of positive RP gains this season. */
    totalRpEarned: integer('total_rp_earned').notNull().default(0),
    matchesPlayed: integer('matches_played').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    currentWinStreak: integer('current_win_streak').notNull().default(0),
    longestWinStreak: integer('longest_win_streak').notNull().default(0),
    mvpAwards: integer('mvp_awards').notNull().default(0),
    /** Battle-pass / season track XP. */
    seasonXp: integer('season_xp').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.seasonId] }),
    index('season_player_stats_rp_idx').on(table.seasonId, table.rp),
  ],
);

/** Completed ranked/casual match header. */
export const matches = pgTable(
  'matches',
  {
    id: text('id').primaryKey(),
    seasonId: text('season_id').references(() => seasons.id, { onDelete: 'set null' }),
    mapId: text('map_id').notNull(),
    mode: text('mode').notNull().default('tdm'),
    roomId: text('room_id'),
    winningTeamId: integer('winning_team_id').notNull().default(-1),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('matches_season_ended_idx').on(table.seasonId, table.endedAt),
    index('matches_ended_idx').on(table.endedAt),
  ],
);

/** Per-player result row for a match (feeds recent history + RP delta). */
export const matchParticipants = pgTable(
  'match_participants',
  {
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: integer('team_id').notNull().default(0),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    won: boolean('won').notNull().default(false),
    tied: boolean('tied').notNull().default(false),
    rpDelta: integer('rp_delta').notNull().default(0),
    xpGained: integer('xp_gained').notNull().default(0),
    seasonXpGained: integer('season_xp_gained').notNull().default(0),
    mineralsGained: integer('minerals_gained').notNull().default(0),
    wasMvp: boolean('was_mvp').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.userId] }),
    index('match_participants_user_idx').on(table.userId),
  ],
);

/** Season reward track catalog (battle-pass style). */
export const seasonRewards = pgTable(
  'season_rewards',
  {
    id: text('id').primaryKey(),
    seasonId: text('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    /** Track level that unlocks this reward (1-based). */
    level: integer('level').notNull(),
    rewardType: text('reward_type').notNull(),
    rewardLabel: text('reward_label').notNull(),
    rewardAmount: integer('reward_amount'),
    rewardItemId: text('reward_item_id'),
    /** Optional UI preview image (absolute public path). */
    previewImageUrl: text('preview_image_url'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('season_rewards_season_level_uidx').on(table.seasonId, table.level),
    index('season_rewards_season_idx').on(table.seasonId),
  ],
);

/** Claimed season track rewards. */
export const userSeasonRewardClaims = pgTable(
  'user_season_reward_claims',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seasonId: text('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    level: integer('level').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.seasonId, table.level] }),
  ],
);
