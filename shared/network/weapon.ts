/** Client switches active loadout slot (0 = key 1, 1 = key 2, 2 = key 3). */
export interface SwitchWeaponMessage {
  readonly slot: number;
}

/** Client equips or unequips the melee weapon (katana). */
export interface EquipMeleeMessage {
  readonly equipped: boolean;
}
