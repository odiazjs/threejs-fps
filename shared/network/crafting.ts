export const CRAFT_ITEM_MESSAGE = 'craftItem' as const;
export const CRAFT_ITEM_GRANTED_MESSAGE = 'craftItemGranted' as const;

export interface CraftItemMessage {
  readonly itemId: string;
  /** Client feet position for proximity validation. */
  readonly x: number;
  readonly z: number;
}

export interface CraftItemGrantedMessage {
  readonly itemId: string;
  readonly matchPlasmaMinerals: number;
  /** Present when a weapon was crafted into a loadout slot. */
  readonly weaponId?: string;
  readonly slotIndex?: number;
  /** Present for ammo crafts (client applies reserve clip locally). */
  readonly ammoClips?: number;
}
