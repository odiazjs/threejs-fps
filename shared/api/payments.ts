import type { PlasmaMineralPackId } from '../content/plasmaMineralPacks.js';

export interface CreatePlasmaCheckoutRequest {
  packId: PlasmaMineralPackId | string;
}

export interface CreatePlasmaCheckoutResponse {
  checkoutUrl: string;
  packId: PlasmaMineralPackId;
}

/** Read-only: whether the Lemon webhook has credited this pack recently. */
export interface PlasmaPurchaseStatusResponse {
  credited: boolean;
  packId: PlasmaMineralPackId;
  amountGranted: number | null;
  plasmaMinerals: number;
}
