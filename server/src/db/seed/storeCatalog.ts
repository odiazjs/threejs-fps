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
];
