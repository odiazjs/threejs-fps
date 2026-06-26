import type { RecoilKick, WeaponConfig } from '../../shared/content/weaponConfig';
import type { WeaponId } from '../../shared/content/weaponIds';
import {
  WEAPON_DAMAGE,
  WEAPON_RELOAD_SEC,
} from '../../shared/content/weaponStats';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { PROJECTILE_SPEED } from '../combat/projectileConfig';

export type { WeaponConfig };

const SNIPER_PROJECTILE_SPEED = 675;

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

/** Bolt-action sniper: punishing single-shot kick. */
function buildSniperRecoilPattern(): RecoilKick[] {
  return Array.from({ length: 8 }, (_, i) => ({
    pitch: 0.168,
    yaw: (i % 2 === 0 ? 1 : -1) * 0.038,
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
  projectileSpeed: PROJECTILE_SPEED,
  view: {
    hip: { x: 0.15, y: -0.25, z: -0.35 },
    ads: { x: 0, y: -0.19, z: -0.35 },
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
    visualKick: 0.5,
    visualRecoverySpeed: 14,
    adsVisualMultiplier: 0.45,
    visualStyle: {
      rotX: 0.34,
      rotYFromYaw: -0.12,
      rotZ: -0.1,
      posXFromYaw: -0.03,
      posY: -0.03,
      posZ: 0,
      kickBack: 0.065,
      kickUp: -0.018,
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
  sway: { intensity: 0.95 },
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
  projectileSpeed: PROJECTILE_SPEED,
  view: {
    hip: { x: 0.12, y: -0.16, z: -0.28 },
    ads: { x: 0.0, y: -0.12, z: -0.25 },
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
    visualKick: 1.05,
    visualRecoverySpeed: 11,
    adsVisualMultiplier: 0.65,
    visualStyle: {
      rotX: 0.48,
      rotYFromYaw: -0.14,
      rotZ: -0.11,
      posXFromYaw: -0.04,
      posY: -0.04,
      posZ: 0,
      kickBack: 0.17,
      kickUp: -0.035,
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
  sway: { intensity: 1.08 },
};

export const SNIPER_RIFLE_CONFIG: WeaponConfig = {
  id: 'sniper_rifle',
  name: 'Sniper Rifle',
  clipSize: 1,
  reloadSec: WEAPON_RELOAD_SEC.sniper_rifle,
  reserveClips: 16,
  fireRate: 1.1,
  fireMode: 'semi',
  damage: WEAPON_DAMAGE.sniper_rifle,
  projectileSpeed: SNIPER_PROJECTILE_SPEED,
  view: {
    hip: { x: 0.1, y: -0.24, z: -0.44 },
    ads: { x: 0, y: -0.15, z: -0.4 },
    adsFov: 18,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildSniperRecoilPattern(),
    recoverySpeed: 5,
    aimSmoothSpeed: 13,
    adsMultiplier: 0.92,
    yawScale: 1.45,
    visualKick: 2.9,
    visualRecoverySpeed: 6,
    adsVisualMultiplier: 0.88,
    visualStyle: {
      rotX: 1.18,
      rotYFromYaw: -0.32,
      rotZ: -0.26,
      posXFromYaw: -0.075,
      posY: -0.07,
      posZ: 0,
      kickBack: 0.6,
      kickUp: -0.125,
    },
  },
  muzzleFlash: {
    coreScale: 0.26,
    duration: 0.11,
    particleCount: 8,
    particleSpeed: 34,
    particleSpread: 0.32,
    colors: [0xfff4e8, 0xffb347, 0xff6a1a],
    lightIntensity: 4.8,
    lightDistance: 6.5,
    glowScale: 0.55,
    glowLayers: 2,
    particleSizeScale: 1.35,
  },
  sway: { intensity: 0.72 },
};

export const WEAPON_CONFIGS: Record<WeaponId, WeaponConfig> = {
  plasma_rifle: PLASMA_RIFLE_CONFIG,
  pistol: PISTOL_CONFIG,
  sniper_rifle: SNIPER_RIFLE_CONFIG,
};

export const DEFAULT_LOADOUT_CONFIGS = [
  PISTOL_CONFIG,
  PLASMA_RIFLE_CONFIG,
  SNIPER_RIFLE_CONFIG,
] as const;

export function getWeaponConfig(id: string): WeaponConfig | null {
  if (id in WEAPON_CONFIGS) {
    return WEAPON_CONFIGS[id as WeaponId];
  }
  return null;
}
