/** Store packs for plasma minerals (amounts credited server-side after Lemon Squeezy payment). */
export const PLASMA_MINERAL_PACK_IDS = ['pack_1k', 'pack_10k', 'pack_100k'] as const;

export type PlasmaMineralPackId = (typeof PLASMA_MINERAL_PACK_IDS)[number];

export interface PlasmaMineralPack {
  id: PlasmaMineralPackId;
  /** Minerals credited on purchase. */
  amount: number;
  /** Display price in USD. */
  priceUsd: number;
  label: string;
}

export const PLASMA_MINERAL_PACKS: readonly PlasmaMineralPack[] = [
  { id: 'pack_1k', amount: 1_000, priceUsd: 9.99, label: '1,000 Plasma' },
  { id: 'pack_10k', amount: 10_000, priceUsd: 19.99, label: '10,000 Plasma' },
  { id: 'pack_100k', amount: 100_000, priceUsd: 29.99, label: '100,000 Plasma' },
] as const;

export function isPlasmaMineralPackId(value: string): value is PlasmaMineralPackId {
  return (PLASMA_MINERAL_PACK_IDS as readonly string[]).includes(value);
}

export function getPlasmaMineralPack(id: string): PlasmaMineralPack | null {
  return PLASMA_MINERAL_PACKS.find((pack) => pack.id === id) ?? null;
}

export function formatPlasmaPackPrice(priceUsd: number): string {
  return `$${priceUsd.toFixed(2)}`;
}
