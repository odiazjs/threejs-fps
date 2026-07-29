export const PLAYER_MAX_HP = 100;
export const RESPAWN_DELAY_SEC = 3;
/** Plasma Harvest first-death respawn wait (seconds). */
export const PLASMA_HARVEST_RESPAWN_BASE_SEC = 10;
/** Extra respawn seconds added per prior death in Plasma Harvest. */
export const PLASMA_HARVEST_RESPAWN_PER_DEATH_SEC = 2;
/** Cap on Plasma Harvest respawn wait. */
export const PLASMA_HARVEST_RESPAWN_MAX_SEC = 18;
/**
 * @deprecated Prefer {@link plasmaHarvestRespawnDelaySec}. Kept as the first-death base.
 */
export const PLASMA_HARVEST_RESPAWN_DELAY_SEC = PLASMA_HARVEST_RESPAWN_BASE_SEC;
export const MAX_HIT_DISTANCE = 75;
export const PLASMA_RIFLE_DAMAGE = 5;

/**
 * Plasma Harvest respawn delay from death count including the death that just occurred.
 * 1st death → 10s, 2nd → 12s, … capped at 18s.
 */
export function plasmaHarvestRespawnDelaySec(deathCountIncludingCurrent: number): number {
  const prior = Math.max(0, Math.floor(deathCountIncludingCurrent) - 1);
  return Math.min(
    PLASMA_HARVEST_RESPAWN_MAX_SEC,
    PLASMA_HARVEST_RESPAWN_BASE_SEC + PLASMA_HARVEST_RESPAWN_PER_DEATH_SEC * prior,
  );
}
