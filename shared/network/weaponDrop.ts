/** Client requests dropping a weapon from an inventory loadout slot. */
export interface DropWeaponMessage {
  readonly slot: number;
}

/** Server broadcasts when a weapon is dropped on the ground. */
export interface WeaponDropSpawnMessage {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly weaponId: string;
}
