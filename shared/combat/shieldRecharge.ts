export const SHIELD_CHARGE_TIME_SEC = 3;

export interface ShieldRechargeState {
  readonly recharging: boolean;
  readonly progress: number;
}

export function getShieldRechargeState(
  shieldRecharging: boolean,
  rechargeEndAt: number,
  worldTime: number,
): ShieldRechargeState {
  if (!shieldRecharging || rechargeEndAt <= 0) {
    return { recharging: false, progress: 0 };
  }

  const remaining = rechargeEndAt - worldTime;
  if (remaining <= 0) {
    return { recharging: true, progress: 1 };
  }

  return {
    recharging: true,
    progress: 1 - remaining / SHIELD_CHARGE_TIME_SEC,
  };
}
