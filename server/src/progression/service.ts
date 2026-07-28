import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  SubmitMatchResultRequest,
  SubmitMatchResultResponse,
} from '../../../shared/api/matchRewards.js';
import type { RankProgressionResponse, ClaimSeasonRewardResponse } from '../../../shared/api/rank.js';
import {
  resolveAccountLevel,
  resolveSeasonTrackLevel,
} from '../../../shared/content/accountXp.js';
import {
  computeMatchRewards,
  sanitizeMatchPerformance,
} from '../../../shared/content/matchRewards.js';
import type {
  RankDefinition,
  RankDivision,
  RankTierId,
} from '../../../shared/content/ranks.js';
import { RANK_DEFINITIONS, resolveRank } from '../../../shared/content/ranks.js';
import type { AuthContext } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { userOperatorUnlocks } from '../db/schema/characters.js';
import { playerStats } from '../db/schema/playerStats.js';
import {
  matchParticipants,
  matches,
  ranks,
  seasonPlayerStats,
  seasonRewards,
  seasons,
  userSeasonRewardClaims,
} from '../db/schema/progression.js';
import { userStoreUnlocks } from '../db/schema/storeItems.js';
import { users } from '../db/schema/users.js';
import { addPlasmaMinerals, ensureUser, getPlasmaMinerals } from '../db/users.js';

const RECENT_MATCH_LIMIT = 10;

const VALID_TIERS = new Set<string>([
  'bronze',
  'silver',
  'gold',
  'titanium',
  'crystal',
  'magmaster',
]);

function toRankDefinition(row: {
  id: string;
  tier: string;
  division: number;
  name: string;
  minRp: number;
  sortOrder: number;
}): RankDefinition | null {
  if (!VALID_TIERS.has(row.tier)) return null;
  if (row.division !== 1 && row.division !== 2 && row.division !== 3) return null;
  return {
    id: row.id,
    tier: row.tier as RankTierId,
    division: row.division as RankDivision,
    name: row.name,
    minRp: row.minRp,
    sortOrder: row.sortOrder,
  };
}

/** Load enabled ranks from DB (falls back to shared constants if empty). */
export async function listRankLadder(): Promise<RankDefinition[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: ranks.id,
      tier: ranks.tier,
      division: ranks.division,
      name: ranks.name,
      minRp: ranks.minRp,
      sortOrder: ranks.sortOrder,
    })
    .from(ranks)
    .where(eq(ranks.enabled, true))
    .orderBy(asc(ranks.sortOrder));

  const ladder = rows
    .map(toRankDefinition)
    .filter((r): r is RankDefinition => r !== null);

  return ladder.length > 0 ? ladder : [...RANK_DEFINITIONS];
}

export interface RankedMatchParticipantInput {
  userId: string;
  teamId: number;
  kills: number;
  deaths: number;
  /** Precomputed RP change for this player. */
  rpDelta: number;
  xpGained: number;
  seasonXpGained: number;
  wasMvp: boolean;
}

export interface RecordRankedMatchInput {
  matchId?: string;
  mapId: string;
  mode?: string;
  roomId?: string;
  winningTeamId: number;
  startedAt?: Date | null;
  participants: RankedMatchParticipantInput[];
}

async function getActiveSeason() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .orderBy(desc(seasons.sortOrder))
    .limit(1);
  return row ?? null;
}

async function ensureSeasonPlayerStats(userId: string, seasonId: string) {
  const db = getDb();
  await db
    .insert(seasonPlayerStats)
    .values({ userId, seasonId })
    .onConflictDoNothing({
      target: [seasonPlayerStats.userId, seasonPlayerStats.seasonId],
    });
}

export interface AwardMatchPerformanceResult {
  readonly matchId: string;
  readonly newlyAwarded: boolean;
  readonly won: boolean;
  readonly tied: boolean;
  readonly wasMvp: boolean;
  readonly performance: ReturnType<typeof sanitizeMatchPerformance>;
  readonly rewards: ReturnType<typeof computeMatchRewards>;
}

/**
 * Core award path (room or HTTP). Idempotent on (matchId, userId).
 * Does not require Cognito email — user must already exist.
 */
export async function awardMatchPerformanceForUser(
  userId: string,
  request: SubmitMatchResultRequest,
): Promise<AwardMatchPerformanceResult> {
  const matchId = request.matchId?.trim();
  if (!matchId || matchId.length > 120) {
    throw new Error('Invalid match id');
  }
  if (!userId?.trim()) {
    throw new Error('Invalid user id');
  }

  const performance = sanitizeMatchPerformance(request.performance);
  const winningTeamId = Number.isFinite(request.winningTeamId)
    ? Math.floor(request.winningTeamId)
    : -1;
  const teamId = Number.isFinite(request.teamId) ? Math.floor(request.teamId) : 0;
  const tied = winningTeamId < 0;
  const won = !tied && teamId === winningTeamId;
  const wasMvp = Boolean(request.wasMvp);
  const rewards = computeMatchRewards(performance, { won, tied, wasMvp });

  const db = getDb();
  const season = await getActiveSeason();
  const endedAt = new Date();

  await db
    .insert(matches)
    .values({
      id: matchId,
      seasonId: season?.id ?? null,
      mapId: request.mapId?.trim() || 'unknown',
      mode: request.mode?.trim() || 'tdm',
      roomId: request.roomId?.trim() || null,
      winningTeamId,
      startedAt: null,
      endedAt,
    })
    .onConflictDoNothing({ target: matches.id });

  const existing = await db
    .select({
      rpDelta: matchParticipants.rpDelta,
      xpGained: matchParticipants.xpGained,
      seasonXpGained: matchParticipants.seasonXpGained,
      mineralsGained: matchParticipants.mineralsGained,
      wasMvp: matchParticipants.wasMvp,
      won: matchParticipants.won,
      tied: matchParticipants.tied,
      kills: matchParticipants.kills,
      deaths: matchParticipants.deaths,
    })
    .from(matchParticipants)
    .where(
      and(
        eq(matchParticipants.matchId, matchId),
        eq(matchParticipants.userId, userId),
      ),
    )
    .limit(1);

  let newlyAwarded = false;
  if (existing.length === 0) {
    newlyAwarded = true;
    await db.insert(matchParticipants).values({
      matchId,
      userId,
      teamId,
      kills: performance.kills,
      deaths: performance.deaths,
      won,
      tied,
      rpDelta: rewards.rpDelta,
      xpGained: rewards.totalXp,
      seasonXpGained: rewards.seasonXp,
      mineralsGained: rewards.mineralsGained,
      wasMvp,
    });

    if (rewards.mineralsGained > 0) {
      await addPlasmaMinerals(userId, rewards.mineralsGained);
    }

    const [career] = await db
      .select({ xp: playerStats.xp })
      .from(playerStats)
      .where(eq(playerStats.userId, userId))
      .limit(1);
    const nextXp = (career?.xp ?? 0) + Math.max(0, rewards.totalXp);
    const levelProgress = resolveAccountLevel(nextXp);

    await db
      .insert(playerStats)
      .values({
        userId,
        matchesPlayed: 1,
        wins: won ? 1 : 0,
        xp: nextXp,
        level: levelProgress.level,
      })
      .onConflictDoUpdate({
        target: playerStats.userId,
        set: {
          matchesPlayed: sql`${playerStats.matchesPlayed} + 1`,
          wins: won ? sql`${playerStats.wins} + 1` : playerStats.wins,
          xp: nextXp,
          level: levelProgress.level,
          updatedAt: endedAt,
        },
      });

    if (season) {
      await ensureSeasonPlayerStats(userId, season.id);
      const [seasonRow] = await db
        .select()
        .from(seasonPlayerStats)
        .where(
          and(
            eq(seasonPlayerStats.userId, userId),
            eq(seasonPlayerStats.seasonId, season.id),
          ),
        )
        .limit(1);

      const prevRp = seasonRow?.rp ?? 0;
      const nextRp = Math.max(0, prevRp + rewards.rpDelta);
      const peakRp = Math.max(seasonRow?.peakRp ?? 0, nextRp);
      const totalRpEarned =
        (seasonRow?.totalRpEarned ?? 0) + Math.max(0, rewards.rpDelta);
      const nextStreak = won ? (seasonRow?.currentWinStreak ?? 0) + 1 : 0;
      const longestWinStreak = Math.max(
        seasonRow?.longestWinStreak ?? 0,
        nextStreak,
      );
      const mvpAwards = (seasonRow?.mvpAwards ?? 0) + (wasMvp ? 1 : 0);
      const seasonXp = (seasonRow?.seasonXp ?? 0) + Math.max(0, rewards.seasonXp);

      await db
        .update(seasonPlayerStats)
        .set({
          rp: nextRp,
          peakRp,
          totalRpEarned,
          matchesPlayed: sql`${seasonPlayerStats.matchesPlayed} + 1`,
          wins: won ? sql`${seasonPlayerStats.wins} + 1` : seasonPlayerStats.wins,
          currentWinStreak: nextStreak,
          longestWinStreak,
          mvpAwards,
          seasonXp,
          updatedAt: endedAt,
        })
        .where(
          and(
            eq(seasonPlayerStats.userId, userId),
            eq(seasonPlayerStats.seasonId, season.id),
          ),
        );
    }
  }

  const stored = existing[0];
  if (!newlyAwarded && stored) {
    const replayRewards = computeMatchRewards(performance, {
      won: stored.won,
      tied: stored.tied,
      wasMvp: stored.wasMvp,
    });
    return {
      matchId,
      newlyAwarded: false,
      won: stored.won,
      tied: stored.tied,
      wasMvp: stored.wasMvp,
      performance,
      rewards: {
        ...replayRewards,
        totalXp: stored.xpGained,
        seasonXp: stored.seasonXpGained,
        rpDelta: stored.rpDelta,
        mineralsGained: stored.mineralsGained,
      },
    };
  }

  return {
    matchId,
    newlyAwarded,
    won,
    tied,
    wasMvp,
    performance,
    rewards,
  };
}

/**
 * HTTP entry: award from uploaded performance + return progression snapshot.
 * Idempotent on (matchId, userId).
 */
export async function submitPlayerMatchResult(
  auth: AuthContext,
  request: SubmitMatchResultRequest,
): Promise<SubmitMatchResultResponse> {
  await ensureUser(auth);
  const awarded = await awardMatchPerformanceForUser(auth.sub, request);
  const [progression, plasmaMinerals] = await Promise.all([
    getRankProgression(auth),
    getPlasmaMinerals(auth.sub),
  ]);
  return {
    ...awarded,
    account: progression.account,
    rank: progression.rank,
    seasonXpTotal: progression.seasonStats.seasonXp,
    seasonLevel: progression.seasonStats.seasonLevel,
    plasmaMinerals,
  };
}

/**
 * Persist a finished match: career aggregates + season RP/XP + history row.
 * Safe to call from FpsRoom.endMatch once RP formula is wired.
 */
export async function recordRankedMatch(input: RecordRankedMatchInput): Promise<string> {
  const db = getDb();
  const season = await getActiveSeason();
  const matchId = input.matchId ?? randomUUID();
  const tied = input.winningTeamId < 0;
  const endedAt = new Date();

  await db.insert(matches).values({
    id: matchId,
    seasonId: season?.id ?? null,
    mapId: input.mapId,
    mode: input.mode ?? 'tdm',
    roomId: input.roomId ?? null,
    winningTeamId: input.winningTeamId,
    startedAt: input.startedAt ?? null,
    endedAt,
  });

  for (const p of input.participants) {
    const won = !tied && p.teamId === input.winningTeamId;

    await db.insert(matchParticipants).values({
      matchId,
      userId: p.userId,
      teamId: p.teamId,
      kills: p.kills,
      deaths: p.deaths,
      won,
      tied,
      rpDelta: p.rpDelta,
      xpGained: p.xpGained,
      seasonXpGained: p.seasonXpGained,
      wasMvp: p.wasMvp,
    });

    // Career: matches / wins / XP / level
    const [career] = await db
      .select({ xp: playerStats.xp })
      .from(playerStats)
      .where(eq(playerStats.userId, p.userId))
      .limit(1);
    const nextXp = (career?.xp ?? 0) + Math.max(0, p.xpGained);
    const levelProgress = resolveAccountLevel(nextXp);

    await db
      .insert(playerStats)
      .values({
        userId: p.userId,
        matchesPlayed: 1,
        wins: won ? 1 : 0,
        xp: nextXp,
        level: levelProgress.level,
      })
      .onConflictDoUpdate({
        target: playerStats.userId,
        set: {
          matchesPlayed: sql`${playerStats.matchesPlayed} + 1`,
          wins: won ? sql`${playerStats.wins} + 1` : playerStats.wins,
          xp: nextXp,
          level: levelProgress.level,
          updatedAt: endedAt,
        },
      });

    if (!season) continue;

    await ensureSeasonPlayerStats(p.userId, season.id);

    const [seasonRow] = await db
      .select()
      .from(seasonPlayerStats)
      .where(
        and(
          eq(seasonPlayerStats.userId, p.userId),
          eq(seasonPlayerStats.seasonId, season.id),
        ),
      )
      .limit(1);

    const prevRp = seasonRow?.rp ?? 0;
    const nextRp = Math.max(0, prevRp + p.rpDelta);
    const peakRp = Math.max(seasonRow?.peakRp ?? 0, nextRp);
    const totalRpEarned =
      (seasonRow?.totalRpEarned ?? 0) + Math.max(0, p.rpDelta);
    const nextStreak = won ? (seasonRow?.currentWinStreak ?? 0) + 1 : 0;
    const longestWinStreak = Math.max(
      seasonRow?.longestWinStreak ?? 0,
      nextStreak,
    );
    const mvpAwards = (seasonRow?.mvpAwards ?? 0) + (p.wasMvp ? 1 : 0);
    const seasonXp = (seasonRow?.seasonXp ?? 0) + Math.max(0, p.seasonXpGained);

    await db
      .update(seasonPlayerStats)
      .set({
        rp: nextRp,
        peakRp,
        totalRpEarned,
        matchesPlayed: sql`${seasonPlayerStats.matchesPlayed} + 1`,
        wins: won ? sql`${seasonPlayerStats.wins} + 1` : seasonPlayerStats.wins,
        currentWinStreak: nextStreak,
        longestWinStreak,
        mvpAwards,
        seasonXp,
        updatedAt: endedAt,
      })
      .where(
        and(
          eq(seasonPlayerStats.userId, p.userId),
          eq(seasonPlayerStats.seasonId, season.id),
        ),
      );
  }

  return matchId;
}

/**
 * Claim a single season track reward the player has unlocked.
 * Grants credits / operator / store skin, then marks the claim.
 */
export async function claimSeasonReward(
  auth: AuthContext,
  level: number,
): Promise<ClaimSeasonRewardResponse> {
  await ensureUser(auth);
  const db = getDb();
  const userId = auth.sub;
  const trackLevel = Math.floor(level);
  if (!Number.isFinite(trackLevel) || trackLevel < 1) {
    throw new Error('Invalid season reward level');
  }

  const season = await getActiveSeason();
  if (!season) {
    throw new Error('No active season configured');
  }

  await ensureSeasonPlayerStats(userId, season.id);

  const [[seasonRow], [reward], [existingClaim]] = await Promise.all([
    db
      .select({ seasonXp: seasonPlayerStats.seasonXp })
      .from(seasonPlayerStats)
      .where(
        and(
          eq(seasonPlayerStats.userId, userId),
          eq(seasonPlayerStats.seasonId, season.id),
        ),
      )
      .limit(1),
    db
      .select()
      .from(seasonRewards)
      .where(
        and(
          eq(seasonRewards.seasonId, season.id),
          eq(seasonRewards.level, trackLevel),
        ),
      )
      .limit(1),
    db
      .select({ level: userSeasonRewardClaims.level })
      .from(userSeasonRewardClaims)
      .where(
        and(
          eq(userSeasonRewardClaims.userId, userId),
          eq(userSeasonRewardClaims.seasonId, season.id),
          eq(userSeasonRewardClaims.level, trackLevel),
        ),
      )
      .limit(1),
  ]);

  if (!reward) {
    throw new Error('Season reward not found');
  }
  if (existingClaim) {
    throw new Error('Reward already claimed');
  }

  const seasonTrack = resolveSeasonTrackLevel(seasonRow?.seasonXp ?? 0);
  if (seasonTrack.level < trackLevel) {
    throw new Error('Season reward is still locked');
  }

  const itemId = reward.rewardItemId?.trim() || null;

  if (reward.rewardType === 'character' && itemId) {
    await db
      .insert(userOperatorUnlocks)
      .values({ userId, characterId: itemId })
      .onConflictDoNothing();
  } else if (reward.rewardType === 'character_skin' && itemId) {
    await db
      .insert(userStoreUnlocks)
      .values({ userId, itemId })
      .onConflictDoNothing();
  } else if (
    (reward.rewardType === 'credits' || reward.rewardType === 'minerals') &&
    reward.rewardAmount != null &&
    reward.rewardAmount > 0
  ) {
    await addPlasmaMinerals(userId, reward.rewardAmount);
  } else if (reward.rewardType !== 'credits' && reward.rewardType !== 'minerals') {
    throw new Error('Reward cannot be claimed yet');
  }

  await db.insert(userSeasonRewardClaims).values({
    userId,
    seasonId: season.id,
    level: trackLevel,
  });

  const [progression, plasmaMinerals] = await Promise.all([
    getRankProgression(auth),
    getPlasmaMinerals(userId),
  ]);

  const claimed = progression.seasonRewards.find((entry) => entry.level === trackLevel);
  if (!claimed) {
    throw new Error('Could not load claimed reward');
  }

  return {
    claimed,
    plasmaMinerals,
    progression,
  };
}

export async function getRankProgression(
  auth: AuthContext,
): Promise<RankProgressionResponse> {
  await ensureUser(auth);
  const db = getDb();
  const userId = auth.sub;

  const season = await getActiveSeason();
  if (!season) {
    throw new Error('No active season configured');
  }

  await ensureSeasonPlayerStats(userId, season.id);

  const [[userRow], [career], [seasonStats], rewardRows, claimRows, historyRows, ladder] =
    await Promise.all([
      db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db
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
        .limit(1),
      db
        .select()
        .from(seasonPlayerStats)
        .where(
          and(
            eq(seasonPlayerStats.userId, userId),
            eq(seasonPlayerStats.seasonId, season.id),
          ),
        )
        .limit(1),
      db
        .select()
        .from(seasonRewards)
        .where(eq(seasonRewards.seasonId, season.id))
        .orderBy(asc(seasonRewards.sortOrder), asc(seasonRewards.level)),
      db
        .select({ level: userSeasonRewardClaims.level })
        .from(userSeasonRewardClaims)
        .where(
          and(
            eq(userSeasonRewardClaims.userId, userId),
            eq(userSeasonRewardClaims.seasonId, season.id),
          ),
        ),
      db
        .select({
          matchId: matchParticipants.matchId,
          mapId: matches.mapId,
          won: matchParticipants.won,
          tied: matchParticipants.tied,
          rpDelta: matchParticipants.rpDelta,
          xpGained: matchParticipants.xpGained,
          seasonXpGained: matchParticipants.seasonXpGained,
          mineralsGained: matchParticipants.mineralsGained,
          kills: matchParticipants.kills,
          deaths: matchParticipants.deaths,
          endedAt: matches.endedAt,
        })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .where(
          and(
            eq(matchParticipants.userId, userId),
            eq(matches.seasonId, season.id),
          ),
        )
        .orderBy(desc(matches.endedAt))
        .limit(RECENT_MATCH_LIMIT),
      listRankLadder(),
    ]);

  const displayName = userRow?.displayName ?? auth.displayName ?? 'Player';
  const careerStats = career ?? {
    kills: 0,
    deaths: 0,
    matchesPlayed: 0,
    wins: 0,
    xp: 0,
    level: 1,
  };
  const seasonRow = seasonStats ?? {
    rp: 0,
    peakRp: 0,
    totalRpEarned: 0,
    matchesPlayed: 0,
    wins: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    mvpAwards: 0,
    seasonXp: 0,
  };

  const account = resolveAccountLevel(careerStats.xp);
  const seasonTrack = resolveSeasonTrackLevel(seasonRow.seasonXp);
  const rankResolved = resolveRank(seasonRow.rp, ladder);
  const peakRank = resolveRank(seasonRow.peakRp, ladder);
  const claimedLevels = new Set(claimRows.map((r) => r.level));
  const endsInMs = Math.max(0, season.endsAt.getTime() - Date.now());
  const winRate =
    careerStats.matchesPlayed > 0
      ? careerStats.wins / careerStats.matchesPlayed
      : 0;
  const kd =
    careerStats.deaths > 0
      ? careerStats.kills / careerStats.deaths
      : careerStats.kills;

  return {
    displayName,
    account: {
      level: account.level,
      totalXp: account.totalXp,
      xpIntoLevel: account.xpIntoLevel,
      xpForNextLevel: account.xpForNextLevel,
    },
    career: {
      matchesPlayed: careerStats.matchesPlayed,
      wins: careerStats.wins,
      winRate,
      kills: careerStats.kills,
      deaths: careerStats.deaths,
      kd,
    },
    season: {
      id: season.id,
      name: season.name,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      endsInMs,
    },
    seasonStats: {
      rp: seasonRow.rp,
      peakRp: seasonRow.peakRp,
      totalRpEarned: seasonRow.totalRpEarned,
      matchesPlayed: seasonRow.matchesPlayed,
      wins: seasonRow.wins,
      currentWinStreak: seasonRow.currentWinStreak,
      longestWinStreak: seasonRow.longestWinStreak,
      mvpAwards: seasonRow.mvpAwards,
      seasonLevel: seasonTrack.level,
      seasonXp: seasonTrack.totalXp,
      seasonXpIntoLevel: seasonTrack.xpIntoLevel,
      seasonXpForNextLevel: seasonTrack.xpForNextLevel,
      highestRankName: peakRank.current.name,
    },
    rank: {
      id: rankResolved.current.id,
      tier: rankResolved.current.tier,
      division: rankResolved.current.division,
      name: rankResolved.current.name,
      minRp: rankResolved.current.minRp,
      rp: seasonRow.rp,
      next: rankResolved.next,
      rpToNext: rankResolved.rpToNext,
      progress01: rankResolved.progress01,
    },
    rankLadder: ladder,
    seasonRewards: rewardRows.map((r) => ({
      level: r.level,
      rewardType: r.rewardType,
      rewardLabel: r.rewardLabel,
      rewardAmount: r.rewardAmount,
      rewardItemId: r.rewardItemId,
      previewImageUrl: r.previewImageUrl ?? null,
      unlocked: seasonTrack.level >= r.level,
      claimed: claimedLevels.has(r.level),
    })),
    recentMatches: historyRows.map((h) => ({
      matchId: h.matchId,
      mapId: h.mapId,
      won: h.won,
      tied: h.tied,
      rpDelta: h.rpDelta,
      xpGained: h.xpGained,
      seasonXpGained: h.seasonXpGained,
      mineralsGained: h.mineralsGained,
      kills: h.kills,
      deaths: h.deaths,
      endedAt: h.endedAt.toISOString(),
    })),
  };
}
