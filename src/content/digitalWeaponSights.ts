import type * as THREE from 'three';
import {
  PRECISION_CORE_SIGHT_ID,
  RETHER_PULSE_SIGHT_ID,
  type DigitalSightId,
} from '../../shared/content/weaponUnlockables';
import {
  mountDigitalSightOnWeapon,
  preloadDigitalSightTexture,
  rebindDigitalSightUserData,
  type DigitalSightMountConfig,
  type DigitalSightStyle,
} from '../combat/DigitalSight';

export interface DigitalSightCatalogEntry {
  readonly id: DigitalSightId;
  readonly textureUrl: string;
  readonly size: number;
}

const DEFAULT_SIZE = 0.225;

/** Client catalog of digital optics (texture + size). */
export const DIGITAL_SIGHT_CATALOG: Record<DigitalSightId, DigitalSightCatalogEntry> = {
  [RETHER_PULSE_SIGHT_ID]: {
    id: RETHER_PULSE_SIGHT_ID,
    textureUrl: '/images/weapons/red_dot_1.png',
    size: DEFAULT_SIZE,
  },
  [PRECISION_CORE_SIGHT_ID]: {
    id: PRECISION_CORE_SIGHT_ID,
    textureUrl: '/images/weapons/red_dot_2.png',
    size: DEFAULT_SIZE,
  },
};

export function getDigitalSightCatalogEntry(
  sightId: string | null | undefined,
): DigitalSightCatalogEntry | null {
  if (!sightId) return null;
  return DIGITAL_SIGHT_CATALOG[sightId as DigitalSightId] ?? null;
}

export function digitalSightStyleFromEntry(
  entry: DigitalSightCatalogEntry,
): DigitalSightStyle {
  return { textureUrl: entry.textureUrl, size: entry.size };
}

/** Default mount used when creating weapon meshes (texture swapped at runtime). */
export const DEFAULT_DIGITAL_SIGHT_MOUNT: DigitalSightMountConfig = {
  alongBarrelFromMuzzle: 0.45,
  heightAboveTop: 0.08,
  lateral: 0.5,
  style: digitalSightStyleFromEntry(DIGITAL_SIGHT_CATALOG[RETHER_PULSE_SIGHT_ID]),
};

export function preloadDigitalSightTextures(): Promise<unknown> {
  return Promise.all(
    Object.values(DIGITAL_SIGHT_CATALOG).map((entry) =>
      preloadDigitalSightTexture(entry.textureUrl).catch(() => null),
    ),
  );
}

/** Mount a digital optic socket on a gun viewmodel (ADS visibility gated separately). */
export function mountDigitalSightSocketOnWeapon(
  mesh: THREE.Group,
  contentName: string,
): void {
  mountDigitalSightOnWeapon(mesh, contentName, DEFAULT_DIGITAL_SIGHT_MOUNT);
  rebindDigitalSightUserData(mesh);
}

// --- Back-compat aliases (older imports) ---
export const RETHER_PULSE_SIGHT_TEXTURE =
  DIGITAL_SIGHT_CATALOG[RETHER_PULSE_SIGHT_ID].textureUrl;
export const RETHER_PULSE_DIGITAL_SIGHT_MOUNT = DEFAULT_DIGITAL_SIGHT_MOUNT;
export const preloadRetherPulseSightTexture = preloadDigitalSightTextures;
export const mountRetherPulseSightOnWeapon = mountDigitalSightSocketOnWeapon;
