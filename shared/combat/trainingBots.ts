import { getGroundHeight } from '../level/collision.js';
import { EYE_HEIGHT } from '../level/levelData.js';

export const TRAINING_BOT_TEAM_ID = 1;
export const TRAINING_BOT_ID_PREFIX = 'bot_';

/** Meters above local ground when a bot spawns — gravity settles them onto the terrain. */
export const TRAINING_BOT_SPAWN_DROP_OFFSET = 4;

/** Fixed idle positions — bots respawn exactly here after death. */
export const TRAINING_BOT_SPAWNS = [
  { x: 18, z: -22, yaw: 0.35 },
  { x: -24, z: -18, yaw: 1.2 },
  { x: 28, z: 12, yaw: 2.4 },
  { x: -32, z: 28, yaw: -0.9 },
  { x: 6, z: 38, yaw: Math.PI },
  { x: -12, z: -42, yaw: 0.8 },
] as const;

export function trainingBotSpawnEyeY(x: number, z: number): number {
  return getGroundHeight(x, z, 0) + EYE_HEIGHT + TRAINING_BOT_SPAWN_DROP_OFFSET;
}

export function trainingBotSessionId(index: number): string {
  return `${TRAINING_BOT_ID_PREFIX}${index}`;
}

export function trainingBotUsername(index: number): string {
  return trainingBotSessionId(index);
}

export function isTrainingBotSessionId(sessionId: string): boolean {
  return sessionId.startsWith(TRAINING_BOT_ID_PREFIX);
}

export function isTrainingBotUsername(username: string): boolean {
  return username.startsWith(TRAINING_BOT_ID_PREFIX);
}
