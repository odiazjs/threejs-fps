/** Fraction of catalog cost refunded when selling an unlocked store item back. */
export const STORE_SELL_BACK_RATE = 0.4;

/** Integer plasma refund for selling an item with the given catalog cost. */
export function storeSellBackRefund(cost: number): number {
  if (cost <= 0) return 0;
  return Math.floor(cost * STORE_SELL_BACK_RATE);
}
