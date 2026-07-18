import type { WeaponId } from '../content/weaponIds.js';

import { GRENADE_PICKUP_GRANT } from '../throwables/grenadeConfig.js';

export interface FiringRangeCrateTop {
  x: number;
  z: number;
  y: number;
}

export interface MapPickupXZ {
  x: number;
  z: number;
}

export interface FiringRangeWeaponSpawn extends MapPickupXZ {
  yaw: number;
  weaponId: WeaponId;
}

const PICKUP_SURFACE_OFFSET = 0.02;
/** Max XZ distance (m) to match a server-synced pickup to a crate top. */
const SURFACE_MATCH_RADIUS = 0.75;

const FIRING_RANGE_SHIELD_COUNT = 2;
const FIRING_RANGE_AMMO_COUNT = 2;

/** Two of each gun — one weapon per assigned crate (melee is always available via X). */
const FIRING_RANGE_WEAPON_LOADOUT: readonly WeaponId[] = [
  'pistol',
  'plasma_shotgun',
  'sniper_rifle',
  'bio_machine_gun',
  'bio_smg_1',
  'bio_liquid_rifle',
];

let crateSurfaces: FiringRangeCrateTop[] = [];
let ammoPositions: MapPickupXZ[] = [];
let shieldPositions: MapPickupXZ[] = [];
let weaponSpawns: FiringRangeWeaponSpawn[] = [];
let grenadePositions: MapPickupXZ[] = [];

/** World Y for a pickup on a crate (nearest crate top within match radius). */
export function getFiringRangePickupY(x: number, z: number): number | undefined {
  const maxDistSq = SURFACE_MATCH_RADIUS * SURFACE_MATCH_RADIUS;
  let best: FiringRangeCrateTop | undefined;
  let bestDistSq = maxDistSq;

  for (const surface of crateSurfaces) {
    const dx = surface.x - x;
    const dz = surface.z - z;
    const distSq = dx * dx + dz * dz;
    if (distSq > bestDistSq) continue;
    bestDistSq = distSq;
    best = surface;
  }

  if (!best) return undefined;
  return best.y + PICKUP_SURFACE_OFFSET;
}

export function getFiringRangeAmmoPositions(): readonly MapPickupXZ[] {
  return ammoPositions;
}

export function getFiringRangeShieldPositions(): readonly MapPickupXZ[] {
  return shieldPositions;
}

export function getFiringRangeWeaponSpawns(): readonly FiringRangeWeaponSpawn[] {
  return weaponSpawns;
}

export function getFiringRangeGrenadePositions(): readonly MapPickupXZ[] {
  return grenadePositions;
}

function pushSurface(crate: FiringRangeCrateTop): void {
  crateSurfaces.push(crate);
}

function assignShield(crate: FiringRangeCrateTop): void {
  pushSurface(crate);
  shieldPositions.push({ x: crate.x, z: crate.z });
}

function assignAmmo(crate: FiringRangeCrateTop): void {
  pushSurface(crate);
  ammoPositions.push({ x: crate.x, z: crate.z });
}

function assignWeapon(crate: FiringRangeCrateTop, weaponId: WeaponId): void {
  pushSurface(crate);
  weaponSpawns.push({
    x: crate.x,
    z: crate.z,
    yaw: 0,
    weaponId,
  });
}

function assignGrenades(crate: FiringRangeCrateTop): void {
  pushSurface(crate);
  grenadePositions.push({ x: crate.x, z: crate.z });
}

/**
 * One pickup per crate (sorted by Z, then X):
 * - 2 shield recharge batteries
 * - 6 guns (2× pistol, sniper, plasma rifle)
 * - 2 ammo boxes on remaining crates
 */
export function registerFiringRangePickupsFromCrates(crates: readonly FiringRangeCrateTop[]): void {
  crateSurfaces = [];
  ammoPositions = [];
  shieldPositions = [];
  weaponSpawns = [];
  grenadePositions = [];

  const sorted = [...crates].sort((a, b) => a.z - b.z || a.x - b.x);
  const expected =
    FIRING_RANGE_SHIELD_COUNT
    + FIRING_RANGE_WEAPON_LOADOUT.length
    + FIRING_RANGE_AMMO_COUNT;

  if (sorted.length < expected) {
    console.warn(
      `[FiringRange] Expected ${expected} crate_box anchors, found ${sorted.length}`,
    );
  }

  let index = 0;

  for (let i = 0; i < FIRING_RANGE_SHIELD_COUNT && index < sorted.length; i++, index++) {
    assignShield(sorted[index]!);
  }

  for (let i = 0; i < FIRING_RANGE_WEAPON_LOADOUT.length && index < sorted.length; i++, index++) {
    assignWeapon(sorted[index]!, FIRING_RANGE_WEAPON_LOADOUT[i]!);
  }

  for (let i = 0; i < FIRING_RANGE_AMMO_COUNT && index < sorted.length; i++, index++) {
    assignAmmo(sorted[index]!);
  }

  while (index < sorted.length) {
    assignGrenades(sorted[index]!);
    index += 1;
  }

  console.info(
    `[FiringRange] Pickups on crates — `
    + `${shieldPositions.length} shields, `
    + `${weaponSpawns.length} weapons, `
    + `${ammoPositions.length} ammo, `
    + `${grenadePositions.length} grenade stacks (${GRENADE_PICKUP_GRANT} each)`,
  );
}
