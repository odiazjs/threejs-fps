import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { playerStats } from '../db/schema/playerStats.js';

export interface PlayerStatsRow {
  kills: number;
  deaths: number;
  matchesPlayed: number;
  wins: number;
  xp: number;
  level: number;
}

const EMPTY_STATS: PlayerStatsRow = {
  kills: 0,
  deaths: 0,
  matchesPlayed: 0,
  wins: 0,
  xp: 0,
  level: 1,
};

export async function getPlayerStats(userId: string): Promise<PlayerStatsRow> {
  const db = getDb();
  const [row] = await db
    .select({
      kills: playerStats.kills,
      deaths: playerStats.deaths,
      matchesPlayed: playerStats.matchesPlayed,
      wins: playerStats.wins,
      xp: playerStats.xp,
      level: playerStats.level,
    })
    .from(playerStats)
    .where(eq(playerStats.userId, userId))
    .limit(1);

  return row ?? EMPTY_STATS;
}

export async function incrementKills(userId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(playerStats)
    .values({ userId, kills: 1 })
    .onConflictDoUpdate({
      target: playerStats.userId,
      set: {
        kills: sql`${playerStats.kills} + 1`,
        updatedAt: new Date(),
      },
    });
}

export async function incrementDeaths(userId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(playerStats)
    .values({ userId, deaths: 1 })
    .onConflictDoUpdate({
      target: playerStats.userId,
      set: {
        deaths: sql`${playerStats.deaths} + 1`,
        updatedAt: new Date(),
      },
    });
}
