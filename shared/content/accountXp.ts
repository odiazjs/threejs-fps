/**
 * Account (career) XP → level curve.
 * Level L requires `xpRequiredForLevel(L)` XP to advance to L+1.
 * Tuned so mid-30s levels need ~25k XP (matches rank UI mock).
 */

export const ACCOUNT_START_LEVEL = 1;

/** XP needed to go from `level` → `level + 1`. */
export function xpRequiredForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return 1000 + (safe - 1) * 700;
}

export interface AccountLevelProgress {
  readonly level: number;
  /** Total career XP. */
  readonly totalXp: number;
  /** XP earned within the current level. */
  readonly xpIntoLevel: number;
  /** XP required to finish the current level. */
  readonly xpForNextLevel: number;
}

/** Derive level + bar fill from total career XP. */
export function resolveAccountLevel(totalXp: number): AccountLevelProgress {
  let remaining = Math.max(0, Math.floor(totalXp));
  let level = ACCOUNT_START_LEVEL;

  for (;;) {
    const need = xpRequiredForLevel(level);
    if (remaining < need) {
      return {
        level,
        totalXp: Math.max(0, Math.floor(totalXp)),
        xpIntoLevel: remaining,
        xpForNextLevel: need,
      };
    }
    remaining -= need;
    level += 1;
    // Safety cap — prevent infinite loop on absurd XP.
    if (level > 10_000) {
      return {
        level,
        totalXp: Math.max(0, Math.floor(totalXp)),
        xpIntoLevel: 0,
        xpForNextLevel: xpRequiredForLevel(level),
      };
    }
  }
}

/**
 * Season battle-pass track: flat XP per track level (simpler than account curve).
 * UI shows season levels on the reward strip (e.g. 31–38).
 */
export const SEASON_TRACK_XP_PER_LEVEL = 5000;

export interface SeasonTrackProgress {
  readonly level: number;
  readonly totalXp: number;
  readonly xpIntoLevel: number;
  readonly xpForNextLevel: number;
}

export function resolveSeasonTrackLevel(totalSeasonXp: number): SeasonTrackProgress {
  const safe = Math.max(0, Math.floor(totalSeasonXp));
  const per = SEASON_TRACK_XP_PER_LEVEL;
  const level = Math.floor(safe / per) + 1;
  const xpIntoLevel = safe % per;
  return {
    level,
    totalXp: safe,
    xpIntoLevel,
    xpForNextLevel: per,
  };
}
