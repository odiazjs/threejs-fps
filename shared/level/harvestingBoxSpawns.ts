import type { MapId } from './maps.js';
import {
  isPlasmaHarvestGameMode,
  type GameMode,
} from '../combat/match.js';

export interface HarvestingBoxSpawn {
  readonly index: number;
  /** 0 = Blue, 1 = Orange */
  readonly teamId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Hold F duration to pick up or drop a harvesting box. */
export const HARVESTING_BOX_HOLD_SEC = 3;
/** Hold F duration to install an enemy box at your own base. */
export const HARVESTING_BOX_INSTALL_SEC = 10;
/** Max distance from box / carrier feet / install spot to interact. */
export const HARVESTING_BOX_INTERACT_DISTANCE = 1;
/** Install zone is this far toward midfield from the team's box home. */
export const HARVESTING_BOX_INSTALL_FORWARD_M = 1;

/**
 * Authored `harvesting_box_orange` / `harvesting_box_blue` markers
 * (world coords after {@link HARVEST_MAP_SCALE}). Prefer GLB extraction on client;
 * Y is the marker feet height (not forced to 0).
 */
const HARVEST_BOXES: readonly HarvestingBoxSpawn[] = [
  { index: 0, teamId: 1, x: 17.02, y: 0, z: 19.16 }, // orange / north
  { index: 1, teamId: 0, x: -16.42, y: 0, z: -20.33 }, // blue / south
];

export function getHarvestingBoxSpawns(
  mapId: MapId,
  gameMode?: GameMode | string | null,
): readonly HarvestingBoxSpawn[] {
  if (!isPlasmaHarvestGameMode(gameMode)) return [];
  if (mapId !== 'harvest') return [];
  return HARVEST_BOXES;
}

export function harvestingBoxTeamFromName(name: string): number | null {
  const lower = name.trim().toLowerCase();
  if (lower === 'harvesting_box_orange') return 1;
  if (lower === 'harvesting_box_blue') return 0;
  return null;
}

export function holdSecForHarvestingBoxMode(
  mode: 'pickup' | 'drop' | 'install',
): number {
  return mode === 'install' ? HARVESTING_BOX_INSTALL_SEC : HARVESTING_BOX_HOLD_SEC;
}

/**
 * Install spot for a team's own base: 1m toward map center from that team's
 * harvesting-box home. Steal the enemy crate and plant it here to win.
 */
export function harvestingBoxInstallSpot(
  ownBaseHomeX: number,
  ownBaseHomeZ: number,
): { x: number; z: number } {
  const dx = -ownBaseHomeX;
  const dz = -ownBaseHomeZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    return { x: ownBaseHomeX, z: ownBaseHomeZ + HARVESTING_BOX_INSTALL_FORWARD_M };
  }
  const scale = HARVESTING_BOX_INSTALL_FORWARD_M / len;
  return {
    x: ownBaseHomeX + dx * scale,
    z: ownBaseHomeZ + dz * scale,
  };
}
