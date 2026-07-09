/** Third-person equip / holster clip length (`weapon_swtich_2.fbx`). */
export const WEAPON_SWITCH_ANIM_SEC = 0.44;

/** Third-person katana slash clip length (`melee_attack_2.fbx`). */
export const MELEE_ATTACK_ANIM_SEC = 0.60;

/** How long remote corpses stay visible after death before hiding the model. */
export const REMOTE_DEATH_DISPLAY_SEC = 4;

/** World-space drop applied to the remote death model so the fall reaches the ground. */
export const REMOTE_DEATH_GROUND_DROP = 0.15;

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
