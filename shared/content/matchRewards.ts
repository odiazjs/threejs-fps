/**
 * Match performance → account XP / season XP / RP.
 * Shared so client can preview and server is the award authority.
 */

export interface MatchPerformanceStats {
  readonly kills: number;
  readonly deaths: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly headshotDamage: number;
  readonly shotsFired: number;
  readonly shotsHit: number;
}

export interface MatchRewardContext {
  readonly won: boolean;
  readonly tied: boolean;
  readonly wasMvp: boolean;
  /** Optional; unused in v1 formula but reserved for duration scaling. */
  readonly matchDurationSec?: number;
}

export interface MatchRewardBreakdown {
  readonly baseXp: number;
  readonly killXp: number;
  readonly deathXp: number;
  readonly damageXp: number;
  readonly headshotXp: number;
  readonly accuracyXp: number;
  readonly kdXp: number;
  readonly outcomeXp: number;
  readonly mvpXp: number;
  readonly totalXp: number;
  readonly seasonXp: number;
  readonly rpDelta: number;
  readonly accuracy01: number;
  /** Plasma minerals granted for this match. */
  readonly mineralsGained: number;
}

export interface MatchPerformanceCaps {
  readonly kills: number;
  readonly deaths: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly headshotDamage: number;
  readonly shotsFired: number;
  readonly shotsHit: number;
}

/** Soft anti-exploit clamps for uploaded / room stats. */
export const MATCH_PERF_CAPS: MatchPerformanceCaps = {
  kills: 80,
  deaths: 80,
  damageDealt: 50_000,
  damageTaken: 50_000,
  headshotDamage: 25_000,
  shotsFired: 5_000,
  shotsHit: 5_000,
};

const BASE_XP = 150;
const XP_PER_KILL = 40;
const XP_PER_DEATH = -12;
const DAMAGE_XP_PER_CHUNK = 5;
const DAMAGE_CHUNK = 50;
const HEADSHOT_XP_PER_CHUNK = 8;
const HEADSHOT_CHUNK = 40;
const ACCURACY_XP_MAX = 90;
const ACCURACY_MIN_SHOTS = 8;
const KD_XP_PER_RATIO = 18;
const KD_XP_CAP = 90;
const WIN_XP = 120;
const TIE_XP = 45;
const MVP_XP = 80;

const WIN_RP = 28;
const TIE_RP = 8;
const LOSS_RP = -18;
const RP_PER_KILL = 2;
const RP_PER_DAMAGE_CHUNK = 1;
const RP_DAMAGE_CHUNK = 250;
const RP_MVP_BONUS = 10;
const RP_LOSS_FLOOR = -35;

const BASE_MINERALS = 25;
const MINERALS_PER_KILL = 8;
const MINERALS_PER_DEATH = -2;
const MINERALS_DAMAGE_CHUNK = 100;
const MINERALS_PER_DAMAGE_CHUNK = 1;
const MINERALS_HEADSHOT_CHUNK = 80;
const MINERALS_PER_HEADSHOT_CHUNK = 1;
const MINERALS_ACCURACY_MAX = 15;
const MINERALS_KD_CAP = 15;
const MINERALS_WIN = 30;
const MINERALS_TIE = 10;
const MINERALS_LOSS = 5;
const MINERALS_MVP = 20;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function sanitizeMatchPerformance(
  raw: Partial<MatchPerformanceStats> | null | undefined,
): MatchPerformanceStats {
  const kills = clampInt(raw?.kills ?? 0, 0, MATCH_PERF_CAPS.kills);
  const deaths = clampInt(raw?.deaths ?? 0, 0, MATCH_PERF_CAPS.deaths);
  const damageDealt = clampInt(raw?.damageDealt ?? 0, 0, MATCH_PERF_CAPS.damageDealt);
  const damageTaken = clampInt(raw?.damageTaken ?? 0, 0, MATCH_PERF_CAPS.damageTaken);
  const headshotDamage = clampInt(
    raw?.headshotDamage ?? 0,
    0,
    Math.min(MATCH_PERF_CAPS.headshotDamage, damageDealt),
  );
  const shotsFired = clampInt(raw?.shotsFired ?? 0, 0, MATCH_PERF_CAPS.shotsFired);
  const shotsHit = clampInt(
    raw?.shotsHit ?? 0,
    0,
    Math.min(MATCH_PERF_CAPS.shotsHit, shotsFired),
  );
  return {
    kills,
    deaths,
    damageDealt,
    damageTaken,
    headshotDamage,
    shotsFired,
    shotsHit,
  };
}

export function computeAccuracy01(shotsFired: number, shotsHit: number): number {
  if (shotsFired <= 0) return 0;
  return Math.min(1, Math.max(0, shotsHit / shotsFired));
}

/** Stable match id shared by room + clients for idempotent awards. */
export function buildMatchId(roomId: string, matchStartAt: number): string {
  const room = roomId.trim() || 'room';
  const startMs = Math.max(0, Math.round(matchStartAt * 1000));
  return `${room}_${startMs}`;
}

/**
 * Convert in-match performance into XP / RP awards.
 * All inputs should already be sanitized.
 */
export function computeMatchRewards(
  performance: MatchPerformanceStats,
  context: MatchRewardContext,
): MatchRewardBreakdown {
  const stats = sanitizeMatchPerformance(performance);
  const accuracy01 = computeAccuracy01(stats.shotsFired, stats.shotsHit);

  const killXp = stats.kills * XP_PER_KILL;
  const deathXp = stats.deaths * XP_PER_DEATH;
  const damageXp = Math.floor(stats.damageDealt / DAMAGE_CHUNK) * DAMAGE_XP_PER_CHUNK;
  const headshotXp =
    Math.floor(stats.headshotDamage / HEADSHOT_CHUNK) * HEADSHOT_XP_PER_CHUNK;

  let accuracyXp = 0;
  if (stats.shotsFired >= ACCURACY_MIN_SHOTS) {
    accuracyXp = Math.round(accuracy01 * ACCURACY_XP_MAX);
  }

  const kd =
    stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills > 0 ? stats.kills : 0;
  const kdXp = Math.min(KD_XP_CAP, Math.round(Math.min(kd, 5) * KD_XP_PER_RATIO));

  const outcomeXp = context.tied ? TIE_XP : context.won ? WIN_XP : 0;
  const mvpXp = context.wasMvp ? MVP_XP : 0;

  const rawTotal =
    BASE_XP +
    killXp +
    deathXp +
    damageXp +
    headshotXp +
    accuracyXp +
    kdXp +
    outcomeXp +
    mvpXp;
  const totalXp = Math.max(0, Math.floor(rawTotal));
  const seasonXp = Math.max(0, Math.floor(totalXp * 0.9));

  const outcomeRp = context.tied ? TIE_RP : context.won ? WIN_RP : LOSS_RP;
  const killRp = stats.kills * RP_PER_KILL;
  const damageRp =
    Math.floor(stats.damageDealt / RP_DAMAGE_CHUNK) * RP_PER_DAMAGE_CHUNK;
  const mvpRp = context.wasMvp ? RP_MVP_BONUS : 0;
  let rpDelta = outcomeRp + killRp + damageRp + mvpRp;
  if (!context.won && !context.tied) {
    rpDelta = Math.max(RP_LOSS_FLOOR, rpDelta);
  }
  rpDelta = Math.floor(rpDelta);

  const killMinerals = stats.kills * MINERALS_PER_KILL;
  const deathMinerals = stats.deaths * MINERALS_PER_DEATH;
  const damageMinerals =
    Math.floor(stats.damageDealt / MINERALS_DAMAGE_CHUNK) * MINERALS_PER_DAMAGE_CHUNK;
  const headshotMinerals =
    Math.floor(stats.headshotDamage / MINERALS_HEADSHOT_CHUNK) *
    MINERALS_PER_HEADSHOT_CHUNK;
  let accuracyMinerals = 0;
  if (stats.shotsFired >= ACCURACY_MIN_SHOTS) {
    accuracyMinerals = Math.round(accuracy01 * MINERALS_ACCURACY_MAX);
  }
  const kdMinerals = Math.min(
    MINERALS_KD_CAP,
    Math.round(Math.min(kd, 5) * (MINERALS_KD_CAP / 5)),
  );
  const outcomeMinerals = context.tied
    ? MINERALS_TIE
    : context.won
      ? MINERALS_WIN
      : MINERALS_LOSS;
  const mvpMinerals = context.wasMvp ? MINERALS_MVP : 0;
  const mineralsGained = Math.max(
    0,
    Math.floor(
      BASE_MINERALS +
        killMinerals +
        deathMinerals +
        damageMinerals +
        headshotMinerals +
        accuracyMinerals +
        kdMinerals +
        outcomeMinerals +
        mvpMinerals,
    ),
  );

  return {
    baseXp: BASE_XP,
    killXp,
    deathXp,
    damageXp,
    headshotXp,
    accuracyXp,
    kdXp,
    outcomeXp,
    mvpXp,
    totalXp,
    seasonXp,
    rpDelta,
    accuracy01,
    mineralsGained,
  };
}
