/** Weapon ids chosen for primary / secondary slots (must exist in `weapons`). */
export type LoadoutGunId = string;

export interface WeaponLoadoutSummary {
  id: string;
  name: string;
  primaryWeaponId: LoadoutGunId;
  secondaryWeaponId: LoadoutGunId;
  /** Equipped sight unlockable id on primary, or null. */
  primarySightId: string | null;
  /** Equipped sight unlockable id on secondary, or null. */
  secondarySightId: string | null;
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
  primarySightId?: string | null;
  secondarySightId?: string | null;
  /** When true, become the player's default. First loadout is always default. */
  isDefault?: boolean;
}

export interface UpdateWeaponLoadoutRequest {
  name?: string;
  primaryWeaponId?: string;
  secondaryWeaponId?: string;
  primarySightId?: string | null;
  secondarySightId?: string | null;
  isDefault?: boolean;
}

export interface WeaponLoadoutMutationResponse {
  loadout: WeaponLoadoutSummary;
}
