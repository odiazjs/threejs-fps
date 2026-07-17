import type { StoreItemType } from '../../../../shared/content/storeItemTypes.js';

export interface StoreCatalogEntry {
  id: string;
  type: StoreItemType;
  name: string;
  description: string;
  cost: number;
  defaultUnlocked: boolean;
  enabled: boolean;
  sortOrder: number;
  assetFile: string | null;
}

/** Shipped store catalog — upserted on migrate. */
export const CURRENT_STORE_CATALOG: readonly StoreCatalogEntry[] = [
  {
    id: 'basic',
    type: 'new_character',
    name: 'Basic Operator',
    description: 'Standard issue field suit. Unlocked by default.',
    cost: 0,
    defaultUnlocked: true,
    enabled: true,
    sortOrder: 10,
    assetFile: 'character_basic_tpose.fbx',
  },
  {
    id: 'silver',
    type: 'new_character',
    name: 'Silver Operator',
    description: 'Chrome-finished combat chassis. Prestige cosmetics unlock.',
    cost: 1000,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 20,
    assetFile: 'character_silver_tpose.fbx',
  },
  {
    id: 'tech_nature',
    type: 'new_character',
    name: 'Tech Nature',
    description: 'Bio-circuit overgrowth chassis. Living tech meets field ops.',
    cost: 2500,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 30,
    assetFile: 'character_tech_nature.fbx',
  },
  {
    id: 'magma_fire',
    type: 'new_character',
    name: 'Magma Fire',
    description: 'Volcanic-core combat suit. Heat-scarred plates for elite operators.',
    cost: 3500,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 40,
    assetFile: 'character_magma_fire.fbx',
  },
  {
    id: 'pink_butterfly',
    type: 'new_character',
    name: 'Pink Butterfly',
    description: 'Iridescent parade armor. Soft palette, hard edges.',
    cost: 4000,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 50,
    assetFile: 'character_pink_butterfly_idle.fbx',
  },
  {
    id: 'bumblebee',
    type: 'new_character',
    name: 'Bumblebee',
    description: 'Striped strike chassis. Bold yellow-black field kit for high-visibility operators.',
    cost: 10000,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 60,
    assetFile: 'character_bumblebee.fbx',
  },
];
