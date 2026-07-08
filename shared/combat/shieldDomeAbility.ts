/** Protective shield dome ability — tune for testing. */
export const SHIELD_DOME_DIAMETER = 10;
export const SHIELD_DOME_RADIUS = SHIELD_DOME_DIAMETER * 0.5;
export const SHIELD_DOME_DURATION_SEC = 20;
export const SHIELD_DOME_COOLDOWN_SEC = 45;
export const SHIELD_DOME_CHARGE_SEC = 1.5;
export const SHIELD_DOME_ACTIVATE_KEY = 'KeyQ' as const;

/** Flat dome duration reduction per grenade that hits an opponent's dome. */
export const GRENADE_SHIELD_DOME_TIMER_PENALTY_SEC = 5;

export type ShieldDomeHudState =
  | { mode: 'ready' }
  | { mode: 'charging'; remaining: number; duration: number }
  | { mode: 'active'; remaining: number; duration: number }
  | { mode: 'cooldown'; remaining: number; duration: number };

export function getShieldDomeHudState(
  worldTime: number,
  domeEndAt: number,
  cooldownEndAt: number,
  chargeEndAt: number,
): ShieldDomeHudState {
  if (chargeEndAt > worldTime) {
    return {
      mode: 'charging',
      remaining: chargeEndAt - worldTime,
      duration: SHIELD_DOME_CHARGE_SEC,
    };
  }

  if (cooldownEndAt > worldTime) {
    const remaining = cooldownEndAt - worldTime;
    return {
      mode: domeEndAt > worldTime ? 'active' : 'cooldown',
      remaining,
      duration: SHIELD_DOME_COOLDOWN_SEC,
    };
  }

  return { mode: 'ready' };
}

/** Hemisphere center Y from feet position (flat base on ground). */
export function shieldDomeCenterYFromFeet(feetY: number): number {
  return feetY;
}
