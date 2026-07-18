/** Catalog item kinds for the operator store. */
export type StoreItemType =
  | 'new_weapon'
  | 'weapon_skin'
  | 'character_skin'
  | 'new_character'
  | 'attachment';

export const STORE_ITEM_TYPES: readonly StoreItemType[] = [
  'new_weapon',
  'weapon_skin',
  'character_skin',
  'new_character',
  'attachment',
] as const;

/** Default equipped character skin (store) id. */
export const DEFAULT_CHARACTER_ITEM_ID = 'basic';

/** Types that can be equipped as the active character mesh. */
export const EQUIPABLE_CHARACTER_TYPES: ReadonlySet<string> = new Set([
  'new_character',
  'character_skin',
]);

export function isStoreItemType(value: string): value is StoreItemType {
  return (STORE_ITEM_TYPES as readonly string[]).includes(value);
}

export function isEquipableCharacterType(type: string): boolean {
  return EQUIPABLE_CHARACTER_TYPES.has(type);
}
