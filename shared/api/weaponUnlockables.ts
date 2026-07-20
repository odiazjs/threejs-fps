export type WeaponUnlockableType = 'sight';

export interface WeaponUnlockableState {
  id: string;
  type: WeaponUnlockableType | string;
  name: string;
  description: string;
  cost: number;
  unlocked: boolean;
  sellable: boolean;
  sellRefund: number;
  iconFile: string | null;
  assetKey: string | null;
  compatibleWeaponIds: string[];
}

/** weaponId -> equipped sight unlockable id */
export type EquippedWeaponSightsMap = Record<string, string>;

export interface WeaponUnlockablesListResponse {
  plasmaMinerals: number;
  unlockables: WeaponUnlockableState[];
  /** Persisted per-weapon equipped sights for this user. */
  equippedSights: EquippedWeaponSightsMap;
}

export interface PurchaseWeaponUnlockableResponse {
  plasmaMinerals: number;
  unlockableId: string;
  unlockables: WeaponUnlockableState[];
  equippedSights: EquippedWeaponSightsMap;
}

export interface SellWeaponUnlockableResponse {
  plasmaMinerals: number;
  unlockableId: string;
  refund: number;
  unlockables: WeaponUnlockableState[];
  equippedSights: EquippedWeaponSightsMap;
}

export interface EquipWeaponSightRequest {
  weaponId: string;
  /** Sight unlockable id, or null to unequip. */
  sightId: string | null;
}

export interface EquipWeaponSightResponse {
  weaponId: string;
  sightId: string | null;
  equippedSights: EquippedWeaponSightsMap;
}
