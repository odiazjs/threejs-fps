import type { RecoilKick, WeaponConfig } from '../../shared/content/weaponConfig';
import {
  WEAPON_DAMAGE,
  WEAPON_RELOAD_SEC,
} from '../../shared/content/weaponStats';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { LOADOUT_WEAPON_IDS } from '../../shared/content/weaponIds';

export type { WeaponConfig };

function buildPlasmaRifleRecoilPattern(): RecoilKick[] {
  const pattern: RecoilKick[] = [];

  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    const pitch = (0.013 + t * 0.015);

    let yaw: number;
    if (i < 7) {
      yaw = 0.0045;
    } else if (i < 15) {
      yaw = -0.0055;
    } else if (i < 23) {
      yaw = 0.005;
    } else {
      yaw = -0.004;
    }

    pattern.push({ pitch, yaw });
  }

  return pattern;
}

/** Semi-auto sidearm: heavy single-shot kick. */
function buildPistolRecoilPattern(): RecoilKick[] {
  return Array.from({ length: 12 }, (_, i) => ({
    pitch: 0.052,
    yaw: (i % 2 === 0 ? 1 : -1) * 0.009,
  }));
}

export const PLASMA_RIFLE_CONFIG: WeaponConfig = {
  id: 'plasma_rifle',
  name: 'Plasma Rifle',
  clipSize: 30,
  reloadSec: WEAPON_RELOAD_SEC.plasma_rifle,
  reserveClips: 3,
  fireRate: 10,
  fireMode: 'auto',
  damage: WEAPON_DAMAGE.plasma_rifle,
  view: {
    hip: { x: 0.15, y: -0.18, z: -0.35 },
    ads: { x: 0, y: -0.14, z: -0.3 },
    adsFov: 67,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildPlasmaRifleRecoilPattern(),
    recoverySpeed: 9,
    aimSmoothSpeed: 22,
    adsMultiplier: 0.5,
    yawScale: 0.9,
    visualKick: 0.35,
    visualRecoverySpeed: 14,
    adsVisualMultiplier: 0.45,
    visualStyle: {
      rotX: 0.72,
      rotYFromYaw: -0.2,
      rotZ: -0.16,
      posXFromYaw: -0.05,
      posY: -0.1,
      posZ: 0.2,
    },
  },
  muzzleFlash: {
    coreScale: 0.17,
    duration: 0.085,
    particleCount: 12,
    particleSpeed: 13,
    particleSpread: 0.85,
    colors: [MAP_PALETTE.neonCyan, 0x55eeff, 0x00b8ff],
    lightIntensity: 2.0,
    lightDistance: 3.5,
    glowLayers: 0,
    particleSizeScale: 1.15,
  },
};

export const PISTOL_CONFIG: WeaponConfig = {
  id: 'pistol',
  name: 'Pistol',
  clipSize: 12,
  reloadSec: WEAPON_RELOAD_SEC.pistol,
  reserveClips: 4,
  fireRate: 4,
  fireMode: 'semi',
  damage: WEAPON_DAMAGE.pistol,
  view: {
    hip: { x: 0.12, y: -0.16, z: -0.28 },
    ads: { x: 0.0, y: -0.07, z: -0.18 },
    adsFov: 70,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildPistolRecoilPattern(),
    recoverySpeed: 8,
    aimSmoothSpeed: 20,
    adsMultiplier: 0.75,
    yawScale: 1.1,
    visualKick: 3.6,
    visualRecoverySpeed: 11,
    adsVisualMultiplier: 0.65,
    visualStyle: {
      rotX: 0.72,
      rotYFromYaw: -0.2,
      rotZ: -0.16,
      posXFromYaw: -0.05,
      posY: -0.1,
      posZ: 0.2,
    },
  },
  muzzleFlash: {
    coreScale: 0.15,
    duration: 0.09,
    particleCount: 18,
    particleSpeed: 20,
    particleSpread: 1.1,
    colors: [0xc77dff, MAP_PALETTE.neonCyan, 0x9b4dff],
    lightIntensity: 3.2,
    lightDistance: 3.5,
  },
};

export const WEAPON_CONFIGS: Record<(typeof LOADOUT_WEAPON_IDS)[number], WeaponConfig> = {
  plasma_rifle: PLASMA_RIFLE_CONFIG,
  pistol: PISTOL_CONFIG,
};

export const DEFAULT_LOADOUT_CONFIGS: [WeaponConfig, WeaponConfig] = [
  PISTOL_CONFIG,
  PLASMA_RIFLE_CONFIG,
];

export function getWeaponConfig(id: string): WeaponConfig | null {
  if (id in WEAPON_CONFIGS) {
    return WEAPON_CONFIGS[id as keyof typeof WEAPON_CONFIGS];
  }
  return null;
}
