/** Client requests picking up a weapon drop while aiming at it. */
export interface PickupWeaponDropMessage {
  readonly index: number;
}

/** Server confirms a weapon pickup for the requesting client. */
export interface WeaponPickupGrantedMessage {
  readonly index: number;
  readonly weaponId: string;
}

/** Max distance from player feet to weapon drop for pickup (meters). */
export const WEAPON_PICKUP_MAX_DISTANCE = 5;

/** Max aim-ray distance to start a weapon pickup hold (meters). */
export const WEAPON_PICKUP_AIM_MAX_DISTANCE = 5;
