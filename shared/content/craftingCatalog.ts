import { isPickableWeaponId, type WeaponId } from './weaponIds.js';

/** In-match Plasma Harvest currency — not store / account minerals. */
export const MATCH_PLASMA_MINERALS_START = 100;

export const CRAFT_HOLD_SEC = 3;
/** Max distance from the station's front interact point (meters). */
export const CRAFTING_STATION_INTERACT_DISTANCE = 1;

export type CraftItemKind = 'weapon' | 'grenade' | 'ammo' | 'shield';

export type CraftItemId =
  | WeaponId
  | 'grenade'
  | 'ammo_clip'
  | 'shield_charge';

export interface CraftItemDef {
  readonly id: CraftItemId;
  readonly kind: CraftItemKind;
  readonly label: string;
  readonly cost: number;
  /** Extra amount granted (grenades / clips / charges). Weapons always grant 1. */
  readonly grantAmount: number;
}

/**
 * Craft costs tuned so a full starter kit (sidearm + utility) fits in 100,
 * while heavy guns require saving or team economy play.
 */
export const CRAFT_CATALOG: readonly CraftItemDef[] = [
  { id: 'pistol', kind: 'weapon', label: 'Pistol', cost: 25, grantAmount: 1 },
  { id: 'bio_smg_1', kind: 'weapon', label: 'Bio SMG', cost: 35, grantAmount: 1 },
  { id: 'plasma_rifle', kind: 'weapon', label: 'Plasma Rifle', cost: 40, grantAmount: 1 },
  {
    id: 'root_bio_carbine',
    kind: 'weapon',
    label: 'Root Bio Carbine',
    cost: 45,
    grantAmount: 1,
  },
  {
    id: 'bio_liquid_rifle',
    kind: 'weapon',
    label: 'Bio-Liquid Rifle',
    cost: 50,
    grantAmount: 1,
  },
  {
    id: 'plasma_shotgun',
    kind: 'weapon',
    label: 'Plasma Shotgun',
    cost: 55,
    grantAmount: 1,
  },
  {
    id: 'bio_machine_gun',
    kind: 'weapon',
    label: 'Bio Machine Gun',
    cost: 60,
    grantAmount: 1,
  },
  {
    id: 'sniper_rifle',
    kind: 'weapon',
    label: 'Sniper Rifle',
    cost: 65,
    grantAmount: 1,
  },
  { id: 'grenade', kind: 'grenade', label: 'Grenade', cost: 15, grantAmount: 1 },
  { id: 'ammo_clip', kind: 'ammo', label: 'Ammo Clip', cost: 20, grantAmount: 1 },
  {
    id: 'shield_charge',
    kind: 'shield',
    label: 'Shield Charge',
    cost: 25,
    grantAmount: 1,
  },
] as const;

const CRAFT_BY_ID = new Map<string, CraftItemDef>(
  CRAFT_CATALOG.map((item) => [item.id, item]),
);

export function getCraftItem(id: string): CraftItemDef | null {
  return CRAFT_BY_ID.get(id) ?? null;
}

export function isCraftWeaponId(id: string): id is WeaponId {
  return isPickableWeaponId(id);
}
