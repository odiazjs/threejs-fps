import type { RankDivision, RankTierId } from '../../shared/content/ranks';

/** Public URL for a rank crest: `/images/ui/ranks/gold2.png`. */
export function rankIconUrl(tier: RankTierId | string, division: RankDivision | number): string {
  return `/images/ui/ranks/${tier}${division}.png`;
}

export function formatRp(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

export function formatKd(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

export function formatWinRate(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}
