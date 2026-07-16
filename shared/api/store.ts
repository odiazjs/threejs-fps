export interface StoreItemState {
  id: string;
  type: string;
  name: string;
  description: string;
  cost: number;
  unlocked: boolean;
  /** True when this item is the equipped character (new_character / character_skin). */
  selected: boolean;
  /** Purchased (non-default) items can be sold back for a partial refund. */
  sellable: boolean;
  /** Plasma refund if sold back (0 when not sellable). */
  sellRefund: number;
  assetFile: string | null;
}

export interface StoreItemsResponse {
  plasmaMinerals: number;
  selectedCharacterId: string;
  items: StoreItemState[];
}

export interface PurchaseStoreItemResponse {
  plasmaMinerals: number;
  itemId: string;
  items: StoreItemState[];
}

export interface SellStoreItemResponse {
  plasmaMinerals: number;
  itemId: string;
  refund: number;
  selectedCharacterId: string;
  items: StoreItemState[];
}

export interface SelectStoreItemResponse {
  selectedCharacterId: string;
  items: StoreItemState[];
}
