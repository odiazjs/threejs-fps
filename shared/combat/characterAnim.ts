/** Third-person equip / holster clip length (`Unarmed Equip Over Shoulder.fbx`). */
export const WEAPON_SWITCH_ANIM_SEC = 0.8833333253860474;

/** Third-person katana slash clip length (`Standing Melee Attack Horizontal 100.fbx`). */
export const MELEE_ATTACK_ANIM_SEC = 1.2000000476837158;

export interface TimedCharacterAnimState {
  readonly active: boolean;
  readonly progress: number;
}

export function getTimedCharacterAnimState(
  endAt: number,
  worldTime: number,
  durationSec: number,
): TimedCharacterAnimState {
  if (endAt <= 0 || durationSec <= 0) {
    return { active: false, progress: 0 };
  }

  const remaining = endAt - worldTime;
  if (remaining <= 0) {
    return { active: false, progress: 0 };
  }

  return {
    active: true,
    progress: 1 - remaining / durationSec,
  };
}

export function getWeaponSwitchAnimState(
  weaponSwitchEndAt: number,
  worldTime: number,
): TimedCharacterAnimState {
  return getTimedCharacterAnimState(
    weaponSwitchEndAt,
    worldTime,
    WEAPON_SWITCH_ANIM_SEC,
  );
}

export function getMeleeAttackAnimState(
  meleeAttackEndAt: number,
  worldTime: number,
): TimedCharacterAnimState {
  return getTimedCharacterAnimState(
    meleeAttackEndAt,
    worldTime,
    MELEE_ATTACK_ANIM_SEC,
  );
}
