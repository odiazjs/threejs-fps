/** Weapon ids chosen for primary / secondary slots (must exist in `weapons`). */
export type LoadoutGunId = string;

export interface WeaponLoadoutSummary {
  id: string;
  name: string;
  primaryWeaponId: LoadoutGunId;
  secondaryWeaponId: LoadoutGunId;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WeaponLoadoutsListResponse {
  loadouts: WeaponLoadoutSummary[];
}

export interface CreateWeaponLoadoutRequest {
  name: string;
  primaryWeaponId: string;
  secondaryWeaponId: string;
  /** When true, become the player's default. First loadout is always default. */
  isDefault?: boolean;
}

export interface UpdateWeaponLoadoutRequest {
  name?: string;
  primaryWeaponId?: string;
  secondaryWeaponId?: string;
  isDefault?: boolean;
}

export interface WeaponLoadoutMutationResponse {
  loadout: WeaponLoadoutSummary;
}
