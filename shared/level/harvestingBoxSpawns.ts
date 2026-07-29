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
  /** Authored `base_install_box_pos` for this team's base (opponent plants here). */
  readonly installX: number;
  readonly installY: number;
  readonly installZ: number;
}

/** Hold F duration to drop a box or pick up a loose (mid-field) drop. */
export const HARVESTING_BOX_HOLD_SEC = 1.5;
/** Hold F duration to pick up a box sitting at a team base (own or opponent). */
export const HARVESTING_BOX_BASE_PICKUP_SEC = 3;
/** Hold F duration to install an enemy box at your own base. */
export const HARVESTING_BOX_INSTALL_SEC = 10;
/** Distance from a box home marker to treat a ground box as "at base". */
export const HARVESTING_BOX_AT_BASE_DISTANCE = 1.75;
/** Max distance from box / carrier feet / install spot to interact. */
export const HARVESTING_BOX_INTERACT_DISTANCE = 2.75;
/** Fallback install offset toward midfield when no authored install marker. */
export const HARVESTING_BOX_INSTALL_FORWARD_M = 1;
/**
 * Authored empties sit slightly above the pad ù nudge feet down so crates
 * rest flush on the base platform.
 */
export const HARVESTING_BOX_SURFACE_Y_NUDGE = -0.22;

/** Apply surface nudge to an authored marker / install Y. */
export function harvestingBoxSurfaceY(authoredY: number): number {
  if (!Number.isFinite(authoredY)) return 0;
  return authoredY + HARVESTING_BOX_SURFACE_Y_NUDGE;
}

/**
 * Server / fallback poses from `base_own_box_spawn` + `base_install_box_pos`
 * under `team_*_base` (world coords after {@link HARVEST_MAP_SCALE}).
 * Prefer GLB extraction on the client.
 */
const HARVEST_BOXES: readonly HarvestingBoxSpawn[] = [
  {
    index: 0,
    teamId: 1,
    x: 17.773757,
    y: 1.467864,
    z: 19.218005,
    installX: 16.478728,
    installY: 1.467864,
    installZ: 19.218005,
  }, // orange
  {
    index: 1,
    teamId: 0,
    x: -16.664131,
    y: 1.467864,
    z: -19.41884,
    installX: -15.369102,
    installY: 1.467864,
    installZ: -19.41884,
  }, // blue
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

export type HarvestingBoxHoldMode = 'pickup' | 'pickup_base' | 'drop' | 'install';

export function holdSecForHarvestingBoxMode(mode: HarvestingBoxHoldMode): number {
  if (mode === 'install') return HARVESTING_BOX_INSTALL_SEC;
  if (mode === 'pickup_base') return HARVESTING_BOX_BASE_PICKUP_SEC;
  return HARVESTING_BOX_HOLD_SEC;
}

/** True when a ground box pose is still at any team's home pad. */
export function isHarvestingBoxAtTeamBase(
  spawnX: number,
  spawnZ: number,
  homes: readonly { readonly homeX: number; readonly homeZ: number }[],
): boolean {
  for (const home of homes) {
    if (
      Math.hypot(spawnX - home.homeX, spawnZ - home.homeZ) <=
      HARVESTING_BOX_AT_BASE_DISTANCE
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Install spot for a team's base. Prefers authored `base_install_box_pos`;
 * otherwise 1m toward map center from the team's box home.
 */
export function harvestingBoxInstallSpot(
  ownBaseHomeX: number,
  ownBaseHomeZ: number,
  authored?: { readonly x: number; readonly z: number } | null,
): { x: number; z: number } {
  if (
    authored &&
    Number.isFinite(authored.x) &&
    Number.isFinite(authored.z)
  ) {
    return { x: authored.x, z: authored.z };
  }
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
