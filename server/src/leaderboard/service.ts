import { asc, desc, eq } from 'drizzle-orm';
import type { LeaderboardEntry } from '../../../shared/api/leaderboard.js';
import { getDb } from '../db/index.js';
import { playerStats } from '../db/schema/playerStats.js';
import { users } from '../db/schema/users.js';

const DEFAULT_LIMIT = 100;

export async function getGlobalLeaderboard(limit = DEFAULT_LIMIT): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));

  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      kills: playerStats.kills,
      deaths: playerStats.deaths,
    })
    .from(playerStats)
    .innerJoin(users, eq(users.id, playerStats.userId))
    .orderBy(desc(playerStats.kills), asc(playerStats.deaths), asc(users.displayName))
    .limit(safeLimit);
}
