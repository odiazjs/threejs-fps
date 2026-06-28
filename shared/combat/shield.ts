import { PLAYER_MAX_HP } from './damage.js';

export const SHIELD_MAX_LEVEL = 3;
export const SHIELD_DEFAULT_LEVEL = 1;

/** Shield pool at a given tier — each level adds 33.33% of max health. */
export function getShieldCapacity(
  shieldLevel: number,
  maxHp: number = PLAYER_MAX_HP,
): number {
  const level = Math.max(0, Math.min(SHIELD_MAX_LEVEL, shieldLevel));
  if (level <= 0) return 0;
  return (level / SHIELD_MAX_LEVEL) * maxHp;
}

export function getDefaultShieldPoints(
  shieldLevel: number = SHIELD_DEFAULT_LEVEL,
  maxHp: number = PLAYER_MAX_HP,
): number {
  return getShieldCapacity(shieldLevel, maxHp);
}

export interface ShieldDamageResult {
  hp: number;
  shieldPoints: number;
  absorbedByShield: number;
  dealtToHealth: number;
}

/** Damage hits shield first; overflow applies to health. */
export function applyDamageWithShield(
  hp: number,
  shieldPoints: number,
  damage: number,
): ShieldDamageResult {
  let remaining = Math.max(0, damage);
  let absorbedByShield = 0;

  if (shieldPoints > 0 && remaining > 0) {
    absorbedByShield = Math.min(shieldPoints, remaining);
    shieldPoints -= absorbedByShield;
    remaining -= absorbedByShield;
  }

  const dealtToHealth = Math.min(hp, remaining);
  hp -= dealtToHealth;

  return { hp, shieldPoints, absorbedByShield, dealtToHealth };
}

export function resetPlayerShield(
  shieldLevel: number = SHIELD_DEFAULT_LEVEL,
  maxHp: number = PLAYER_MAX_HP,
): { shieldLevel: number; shieldPoints: number } {
  const level = Math.max(1, Math.min(SHIELD_MAX_LEVEL, shieldLevel));
  return {
    shieldLevel: level,
    shieldPoints: getShieldCapacity(level, maxHp),
  };
}

/** True when a shield charge can raise tier or refill a broken/depleted shield. */
export function canUseShieldCharge(
  shieldLevel: number,
  shieldPoints: number,
  maxHp: number = PLAYER_MAX_HP,
): boolean {
  const level = Math.max(0, Math.min(SHIELD_MAX_LEVEL, shieldLevel));
  if (level <= 0) return true;
  const capacity = getShieldCapacity(level, maxHp);
  if (shieldPoints < capacity) return true;
  return level < SHIELD_MAX_LEVEL;
}

/**
 * Apply one shield charge: refill the current tier when depleted,
 * otherwise upgrade by one tier when already full.
 */
export function applyShieldChargeRecharge(
  shieldLevel: number,
  shieldPoints: number,
  maxHp: number = PLAYER_MAX_HP,
): { shieldLevel: number; shieldPoints: number } {
  const level = Math.max(1, Math.min(SHIELD_MAX_LEVEL, shieldLevel));
  const capacity = getShieldCapacity(level, maxHp);

  if (shieldPoints < capacity) {
    return { shieldLevel: level, shieldPoints: capacity };
  }

  if (level < SHIELD_MAX_LEVEL) {
    const nextLevel = level + 1;
    return {
      shieldLevel: nextLevel,
      shieldPoints: getShieldCapacity(nextLevel, maxHp),
    };
  }

  return { shieldLevel: level, shieldPoints: capacity };
}

/** True when tier and points are both maxed — no benefit from another charge. */
export function isShieldFullyCharged(
  shieldLevel: number,
  shieldPoints: number,
  maxHp: number = PLAYER_MAX_HP,
): boolean {
  return !canUseShieldCharge(shieldLevel, shieldPoints, maxHp);
}
