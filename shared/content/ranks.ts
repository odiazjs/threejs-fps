/**
 * Competitive rank ladder (RP thresholds).
 * Divisions are I / II / III within each tier (1 = I, 2 = II, 3 = III).
 *
 * Canonical copy also lives in DB table `ranks` (migration seed).
 * Keep these in sync when adjusting thresholds.
 */

export type RankTierId =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'titanium'
  | 'crystal'
  | 'magmaster';

export type RankDivision = 1 | 2 | 3;

export interface RankDefinition {
  /** Stable id, e.g. `gold_2` — matches DB `ranks.id`. */
  readonly id: string;
  readonly tier: RankTierId;
  readonly division: RankDivision;
  /** Inclusive minimum RP for this rank. */
  readonly minRp: number;
  /** Display name, e.g. "Gold II". */
  readonly name: string;
  /** Ascending order in the ladder (0 = Bronze I). */
  readonly sortOrder: number;
}

const TIER_LABELS: Record<RankTierId, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  titanium: 'Titanium',
  crystal: 'Crystal',
  magmaster: 'Magmaster',
};

const DIVISION_ROMAN: Record<RankDivision, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
};

function rankId(tier: RankTierId, division: RankDivision): string {
  return `${tier}_${division}`;
}

function rankName(tier: RankTierId, division: RankDivision): string {
  return `${TIER_LABELS[tier]} ${DIVISION_ROMAN[division]}`;
}

function def(
  tier: RankTierId,
  division: RankDivision,
  minRp: number,
  sortOrder: number,
): RankDefinition {
  return {
    id: rankId(tier, division),
    tier,
    division,
    minRp,
    name: rankName(tier, division),
    sortOrder,
  };
}

/** Ordered low → high. Last entry has no upper bound. */
export const RANK_DEFINITIONS: readonly RankDefinition[] = [
  def('bronze', 1, 0, 0),
  def('bronze', 2, 300, 1),
  def('bronze', 3, 600, 2),
  def('silver', 1, 900, 3),
  def('silver', 2, 1200, 4),
  def('silver', 3, 1500, 5),
  def('gold', 1, 1800, 6),
  def('gold', 2, 2100, 7),
  def('gold', 3, 2500, 8),
  def('titanium', 1, 3000, 9),
  def('titanium', 2, 3500, 10),
  def('titanium', 3, 4000, 11),
  def('crystal', 1, 4500, 12),
  def('crystal', 2, 5000, 13),
  def('crystal', 3, 5500, 14),
  def('magmaster', 1, 6000, 15),
  def('magmaster', 2, 6750, 16),
  def('magmaster', 3, 7500, 17),
];

export interface ResolvedRank {
  readonly current: RankDefinition;
  /** Next rank up, or null at Magmaster III. */
  readonly next: RankDefinition | null;
  /** RP needed to reach `next` (0 when at top). */
  readonly rpToNext: number;
  /** Progress within current→next band as 0..1 (1 at top rank). */
  readonly progress01: number;
}

/** Resolve rank from RP against a ladder (DB rows or {@link RANK_DEFINITIONS}). */
export function resolveRank(
  rp: number,
  ladder: readonly RankDefinition[] = RANK_DEFINITIONS,
): ResolvedRank {
  const defs = ladder.length > 0 ? ladder : RANK_DEFINITIONS;
  const safeRp = Math.max(0, Math.floor(rp));
  let current = defs[0]!;
  for (const entry of defs) {
    if (safeRp >= entry.minRp) current = entry;
    else break;
  }

  const idx = defs.findIndex((d) => d.id === current.id);
  const next = idx >= 0 && idx < defs.length - 1 ? defs[idx + 1]! : null;

  if (!next) {
    return { current, next: null, rpToNext: 0, progress01: 1 };
  }

  const span = Math.max(1, next.minRp - current.minRp);
  const into = Math.min(span, Math.max(0, safeRp - current.minRp));
  return {
    current,
    next,
    rpToNext: Math.max(0, next.minRp - safeRp),
    progress01: into / span,
  };
}

export function tierLabel(tier: RankTierId): string {
  return TIER_LABELS[tier];
}
