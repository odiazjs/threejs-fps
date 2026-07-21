import { SHARED_CHARACTER_MESH_FILE } from '../../../../shared/content/characterMesh.js';
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

/** Store catalog = equipable body skins only (operators live in `characters`). */
export const CURRENT_STORE_CATALOG: readonly StoreCatalogEntry[] = [
  {
    id: 'basic',
    type: 'character_skin',
    name: 'Basic Operator',
    description: 'Standard issue field suit. Unlocked by default.',
    cost: 0,
    defaultUnlocked: true,
    enabled: true,
    sortOrder: 10,
    assetFile: SHARED_CHARACTER_MESH_FILE,
  },
  {
    id: 'silver',
    type: 'character_skin',
    name: 'Silver Operator',
    description: 'Chrome-finished combat chassis. Prestige cosmetics unlock.',
    cost: 1000,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 20,
    assetFile: SHARED_CHARACTER_MESH_FILE,
  },
  {
    id: 'tech_nature',
    type: 'character_skin',
    name: 'Tech Nature',
    description: 'Bio-circuit overgrowth chassis. Living tech meets field ops.',
    cost: 2500,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 30,
    assetFile: SHARED_CHARACTER_MESH_FILE,
  },
  {
    id: 'magma_fire',
    type: 'character_skin',
    name: 'Magma Fire',
    description: 'Volcanic-core combat suit. Heat-scarred plates for elite operators.',
    cost: 3500,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 40,
    assetFile: SHARED_CHARACTER_MESH_FILE,
  },
  {
    id: 'pink_butterfly',
    type: 'character_skin',
    name: 'Pink Butterfly',
    description: 'Iridescent parade armor. Soft palette, hard edges.',
    cost: 4000,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 50,
    assetFile: SHARED_CHARACTER_MESH_FILE,
  },
  {
    id: 'bumblebee',
    type: 'character_skin',
    name: 'Bumblebee',
    description: 'Striped strike chassis. Bold yellow-black field kit for high-visibility operators.',
    cost: 10000,
    defaultUnlocked: false,
    enabled: true,
    sortOrder: 60,
    assetFile: SHARED_CHARACTER_MESH_FILE,
  },
];
