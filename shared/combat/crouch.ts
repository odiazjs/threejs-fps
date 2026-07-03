import { CHARACTER_HIT_HEIGHT } from './bodyPartPose.js';
import { EYE_HEIGHT } from '../level/levelData.js';

/** Eye drop while fully crouched — half standing body height. */
export const CROUCH_EYE_DROP = CHARACTER_HIT_HEIGHT * 0.5;

export const CROUCH_EYE_HEIGHT = EYE_HEIGHT - CROUCH_EYE_DROP;

/** Locomotion speed multiplier while crouched (75% slower). */
export const CROUCH_SPEED_MULTIPLIER = 0.25;

/** Convert replicated eye height to feet — crouch lowers eye Y, not feet. */
export function feetYFromNetworkEyeY(eyeY: number, crouching: boolean): number {
  return eyeY - (crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT);
}
