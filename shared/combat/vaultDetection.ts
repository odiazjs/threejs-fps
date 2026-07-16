import { CAPSULE_RADIUS } from '../physics/capsuleConfig.js';
import type { LevelPhysicsWorld } from '../physics/levelPhysicsWorld.js';

/** Autostep max — vault only when the ledge is taller than this. */
const AUTOSTEP_MAX = 0.42;
export const MIN_VAULT_HEIGHT = 0.45;
export const MAX_VAULT_HEIGHT = 1.2;

const WALL_PROBE_HEIGHTS = [0.55, 0.95, 1.25];
const MAX_WALL_DISTANCE = 1.05;
const MIN_RAY_START = CAPSULE_RADIUS * 0.35;
const LEDGE_FORWARD_INSET = 0.12;
const LANDING_FORWARD_OFFSET = CAPSULE_RADIUS + 0.32;
const MAX_WALL_NORMAL_Y = 0.55;
const MIN_VAULT_TRAVEL = 0.38;
const FOOT_WALL_PROBE_HEIGHT = 0.28;

export interface VaultTarget {
  readonly startX: number;
  readonly startY: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endY: number;
  readonly endZ: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface WallProbeHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
}

function findVaultWall(
  physics: LevelPhysicsWorld,
  feetX: number,
  feetY: number,
  feetZ: number,
  forwardX: number,
  forwardZ: number,
): WallProbeHit | null {
  let best: (WallProbeHit & { distance: number }) | null = null;

  for (const probeHeight of WALL_PROBE_HEIGHTS) {
    const hit = physics.raycastWithNormal(
      feetX,
      feetY + probeHeight,
      feetZ,
      forwardX,
      0,
      forwardZ,
      MAX_WALL_DISTANCE,
      MIN_RAY_START,
    );
    if (!hit) continue;
    if (Math.abs(hit.ny) > MAX_WALL_NORMAL_Y) continue;

    const facingWall = hit.nx * forwardX + hit.nz * forwardZ;
    if (facingWall > -0.05) continue;

    if (!best || hit.distance < best.distance) {
      best = {
        x: hit.x,
        y: hit.y,
        z: hit.z,
        nx: hit.nx,
        nz: hit.nz,
        distance: hit.distance,
      };
    }
  }

  return best;
}

/** Forward + height probes to find a vaultable chest-high ledge. */
export function detectVaultTarget(
  physics: LevelPhysicsWorld | null | undefined,
  feetX: number,
  feetY: number,
  feetZ: number,
  dirX: number,
  dirZ: number,
  crouching = false,
): VaultTarget | null {
  if (!physics?.isReady || crouching) return null;

  const flatLen = Math.hypot(dirX, dirZ);
  if (flatLen < 1e-6) return null;

  const forwardX = dirX / flatLen;
  const forwardZ = dirZ / flatLen;

  const wallHit = findVaultWall(physics, feetX, feetY, feetZ, forwardX, forwardZ);
  if (!wallHit) return null;

  const footWall = physics.raycast(
    feetX,
    feetY + FOOT_WALL_PROBE_HEIGHT,
    feetZ,
    forwardX,
    0,
    forwardZ,
    MAX_WALL_DISTANCE,
    MIN_RAY_START,
  );
  if (!footWall) return null;

  const ledgeProbeX = wallHit.x + forwardX * LEDGE_FORWARD_INSET;
  const ledgeProbeZ = wallHit.z + forwardZ * LEDGE_FORWARD_INSET;
  const ledgeTop = physics.raycast(
    ledgeProbeX,
    feetY + MAX_VAULT_HEIGHT + 0.75,
    ledgeProbeZ,
    0,
    -1,
    0,
    MAX_VAULT_HEIGHT + 1.05,
  );
  if (!ledgeTop) return null;

  const vaultHeight = ledgeTop.y - feetY;
  if (vaultHeight < MIN_VAULT_HEIGHT || vaultHeight > MAX_VAULT_HEIGHT) return null;
  if (vaultHeight <= AUTOSTEP_MAX + 0.02) return null;

  const endX = ledgeProbeX + forwardX * LANDING_FORWARD_OFFSET;
  const endZ = ledgeProbeZ + forwardZ * LANDING_FORWARD_OFFSET;
  const landingGround = physics.raycast(
    endX,
    feetY + MAX_VAULT_HEIGHT + 0.75,
    endZ,
    0,
    -1,
    0,
    MAX_VAULT_HEIGHT + 1.05,
  );
  if (!landingGround) return null;
  if (Math.abs(landingGround.y - ledgeTop.y) > 0.22) return null;

  const headroom = physics.raycast(
    endX,
    landingGround.y + 0.05,
    endZ,
    0,
    1,
    0,
    1.45,
    0.05,
  );
  if (headroom) return null;

  if (physics.isSpawnBlocked(endX, endZ, landingGround.y)) return null;

  const rise = landingGround.y - feetY;
  const travel = Math.hypot(endX - feetX, endZ - feetZ);
  if (rise < MIN_VAULT_HEIGHT || travel < MIN_VAULT_TRAVEL) return null;

  return {
    startX: feetX,
    startY: feetY,
    startZ: feetZ,
    endX,
    endY: landingGround.y,
    endZ,
  };
}

export function sampleVaultPosition(
  target: VaultTarget,
  progress: number,
): { x: number; y: number; z: number } {
  const t = easeInOutCubic(Math.min(1, Math.max(0, progress)));
  const rise = Math.max(0, target.endY - target.startY);
  const arc = rise > 0.08 ? Math.sin(t * Math.PI) * Math.min(0.28, rise * 0.18 + 0.08) : 0;
  return {
    x: target.startX + (target.endX - target.startX) * t,
    y: target.startY + (target.endY - target.startY) * t + arc,
    z: target.startZ + (target.endZ - target.startZ) * t,
  };
}
