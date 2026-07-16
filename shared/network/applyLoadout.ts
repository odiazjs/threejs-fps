/** Client requests applying a saved Armory loadout to live match slots. */
export interface ApplyLoadoutMessage {
  readonly loadoutId: string;
  /** From the Armory list already shown in the UI — used if id lookup fails. */
  readonly primaryWeaponId?: string;
  readonly secondaryWeaponId?: string;
}

/** Server acknowledges an applyLoadout attempt. */
export interface ApplyLoadoutResultMessage {
  readonly loadoutId: string;
  readonly ok: boolean;
  readonly error?: string;
  readonly primaryWeaponId?: string;
  readonly secondaryWeaponId?: string;
}
