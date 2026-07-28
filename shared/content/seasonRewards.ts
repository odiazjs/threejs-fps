/**
 * Season track reward kinds used by progression grants + ranked UI.
 * Placeholder catalog rows may still use free-form strings (credits, item, …).
 */
export type SeasonRewardType =
  | 'character'
  | 'character_skin'
  | 'credits'
  | 'minerals'
  | 'item';

/** Operators that require an unlock row (season / future purchase). */
export const SEASON_GATED_OPERATOR_IDS: ReadonlySet<string> = new Set(['steve']);

export function isSeasonGatedOperator(characterId: string): boolean {
  return SEASON_GATED_OPERATOR_IDS.has(characterId);
}

/** Reward kinds that can show a 3D showcase in the ranked season track. */
const MODEL_PREVIEW_REWARD_TYPES: ReadonlySet<string> = new Set([
  'item',
  'character',
  'character_skin',
]);

export function isSeasonRewardModelPreviewable(reward: {
  rewardType: string;
  rewardItemId: string | null;
}): boolean {
  if (!MODEL_PREVIEW_REWARD_TYPES.has(reward.rewardType)) return false;
  return Boolean(reward.rewardItemId?.trim());
}
