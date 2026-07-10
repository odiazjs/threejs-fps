import type { RecoilKick, WeaponConfig } from '../../shared/content/weaponConfig';
import type { WeaponId } from '../../shared/content/weaponIds';
import {
  WEAPON_DAMAGE,
  WEAPON_MAX_HIT_DISTANCE,
  WEAPON_RELOAD_SEC,
} from '../../shared/content/weaponStats';
import { SHIPPED_WEAPON_BASE_STATS } from '../../shared/content/weaponUpgrades';
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
    pitch: 0.078,
    yaw: (i % 2 === 0 ? 1 : -1) * 0.012,
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
  fireRate: SHIPPED_WEAPON_BASE_STATS.plasma_rifle.fireRate,
  fireMode: 'auto',
  damage: WEAPON_DAMAGE.plasma_rifle,
  adsTime: SHIPPED_WEAPON_BASE_STATS.plasma_rifle.adsTime,
  projectileSpeed: PROJECTILE_SPEED,
  maxHitDistance: WEAPON_MAX_HIT_DISTANCE.plasma_rifle,
  view: {
    hip: { x: 0.15, y: -0.25, z: -0.35 },
    ads: { x: 0, y: -0.195, z: -0.22 },
    adsFov: 61,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildPlasmaRifleRecoilPattern(),
    recoverySpeed: 9,
    recoveryDelaySec: 0.08,
    aimSmoothSpeed: 18,
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
  sounds: {
    autoShot: '/sounds/rifle_auto_3.wav',
    reload: '/sounds/rifle_reload_1.wav',
    volume: 0.5,
  },
};

export const PISTOL_CONFIG: WeaponConfig = {
  id: 'pistol',
  name: 'Pistol',
  clipSize: 12,
  reloadSec: WEAPON_RELOAD_SEC.pistol,
  reserveClips: 4,
  fireRate: SHIPPED_WEAPON_BASE_STATS.pistol.fireRate,
  fireMode: 'semi',
  damage: WEAPON_DAMAGE.pistol,
  adsTime: SHIPPED_WEAPON_BASE_STATS.pistol.adsTime,
  projectileSpeed: PROJECTILE_SPEED,
  maxHitDistance: WEAPON_MAX_HIT_DISTANCE.pistol,
  view: {
    hip: { x: 0.12, y: -0.16, z: -0.28 },
    ads: { x: 0.0, y: -0.115, z: -0.25 },
    adsFov: 70,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildPistolRecoilPattern(),
    // Was 60 — with semi-auto `shooting` only true for 1 frame, that wiped kick instantly.
    recoverySpeed: 9,
    recoveryDelaySec: 0.16,
    aimSmoothSpeed: 16,
    adsMultiplier: 0.75,
    yawScale: 1.1,
    visualKick: 0.85,
    visualRecoverySpeed: 12,
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
  sounds: {
    singleShot: '/sounds/pistol_8.wav',
    reload: '/sounds/pistol_reload_1.wav',
    volume: 0.5,
  },
};

export const KATANA_CONFIG: WeaponConfig = {
  id: 'katana',
  name: 'Katana',
  clipSize: 1,
  reloadSec: 0,
  reserveClips: 0,
  fireRate: SHIPPED_WEAPON_BASE_STATS.katana.fireRate,
  fireMode: 'melee',
  damage: WEAPON_DAMAGE.katana,
  adsTime: SHIPPED_WEAPON_BASE_STATS.katana.adsTime || 0.18,
  projectileSpeed: 0,
  moveSpeedMultiplier: 1.15,
  meleeRange: WEAPON_MAX_HIT_DISTANCE.katana,
  maxHitDistance: WEAPON_MAX_HIT_DISTANCE.katana,
  view: {
    hip: { x: 0.12, y: -0.13, z: -0.3 },
    ads: { x: 0.12, y: -0.2, z: -0.3 },
    localMeshEuler: { x: 2.2, y: 1.2, z: 5.2 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: -2.2, y: -1.2, z: -5.2 },
  },
  recoil: {
    pattern: [{ pitch: 0, yaw: 0 }],
    recoverySpeed: 20,
    aimSmoothSpeed: 24,
    adsMultiplier: 1,
    visualKick: 10,
    visualRecoverySpeed: 18,
    adsVisualMultiplier: 1,
  },
  muzzleFlash: {
    coreScale: 0,
    duration: 0,
    particleCount: 0,
    particleSpeed: 0,
    particleSpread: 0,
    colors: [0xffffff, 0xffffff, 0xffffff],
    lightIntensity: 0,
    lightDistance: 0,
    glowLayers: 0,
  },
  sway: { intensity: 1.35 },
  sounds: {
    singleShot: '/sounds/katana_melee_sound_1.wav',
    volume: 0.5,
  },
};

export const SNIPER_RIFLE_CONFIG: WeaponConfig = {
  id: 'sniper_rifle',
  name: 'Sniper Rifle',
  clipSize: 1,
  reloadSec: WEAPON_RELOAD_SEC.sniper_rifle,
  reserveClips: 16,
  fireRate: SHIPPED_WEAPON_BASE_STATS.sniper_rifle.fireRate,
  fireMode: 'semi',
  damage: WEAPON_DAMAGE.sniper_rifle,
  adsTime: SHIPPED_WEAPON_BASE_STATS.sniper_rifle.adsTime,
  projectileSpeed: SNIPER_PROJECTILE_SPEED,
  maxHitDistance: WEAPON_MAX_HIT_DISTANCE.sniper_rifle,
  view: {
    hip: { x: 0.1, y: -0.24, z: -0.44 },
    ads: { x: 0, y: -0.15, z: -0.24 },
    adsFov: 18,
    adsLookSensitivity: 0.5,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildSniperRecoilPattern(),
    recoverySpeed: 5,
    recoveryDelaySec: 0.22,
    aimSmoothSpeed: 12,
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
  sway: { intensity: 1.75 },
  sounds: {
    singleShot: '/sounds/sniper_3.wav',
    reload: '/sounds/sniper_reload_1.wav',
    volume: 0.5,
  },
};

/** Burst carbine — plasma rifle feel with slightly stronger stats. Placeholder mesh/SFX until assets land. */
export const ROOT_BIO_CARBINE_CONFIG: WeaponConfig = {
  id: 'root_bio_carbine',
  name: 'Root Bio Carbine',
  clipSize: 30,
  reloadSec: WEAPON_RELOAD_SEC.root_bio_carbine,
  reserveClips: 3,
  fireRate: SHIPPED_WEAPON_BASE_STATS.root_bio_carbine.fireRate,
  fireMode: 'burst',
  burstCount: 3,
  burstRecoverySec: 0.15,
  damage: WEAPON_DAMAGE.root_bio_carbine,
  adsTime: SHIPPED_WEAPON_BASE_STATS.root_bio_carbine.adsTime,
  projectileSpeed: PROJECTILE_SPEED,
  maxHitDistance: WEAPON_MAX_HIT_DISTANCE.root_bio_carbine,
  view: {
    hip: { x: 0.15, y: -0.25, z: -0.35 },
    ads: { x: 0, y: -0.195, z: -0.22 },
    adsFov: 58,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildPlasmaRifleRecoilPattern(),
    recoverySpeed: 8.5,
    recoveryDelaySec: 0.1,
    aimSmoothSpeed: 18,
    adsMultiplier: 0.48,
    yawScale: 0.95,
    visualKick: 0.55,
    visualRecoverySpeed: 13,
    adsVisualMultiplier: 0.42,
    visualStyle: {
      rotX: 0.36,
      rotYFromYaw: -0.13,
      rotZ: -0.11,
      posXFromYaw: -0.032,
      posY: -0.032,
      posZ: 0,
      kickBack: 0.07,
      kickUp: -0.02,
    },
  },
  muzzleFlash: {
    coreScale: 0.25,
    duration: 0.1,
    particleCount: 14,
    particleSpeed: 14,
    particleSpread: 0.8,
    colors: [0x7dffb0, MAP_PALETTE.neonCyan, 0x2aff9a],
    lightIntensity: 2.5,
    lightDistance: 3.6,
    glowLayers: 0,
    particleSizeScale: 1.2,
  },
  sway: { intensity: 0.92 },
  sounds: {
    singleShot: '/sounds/root_bio_carbine.wav',
    reload: '/sounds/root_bio_carbine_reload.wav',
    volume: 0.5,
  },
};

export const WEAPON_CONFIGS: Record<WeaponId, WeaponConfig> = {
  plasma_rifle: PLASMA_RIFLE_CONFIG,
  pistol: PISTOL_CONFIG,
  sniper_rifle: SNIPER_RIFLE_CONFIG,
  root_bio_carbine: ROOT_BIO_CARBINE_CONFIG,
  katana: KATANA_CONFIG,
};

/** All guns that can occupy numbered loadout slots (includes non-default pickables). */
export const PICKABLE_WEAPON_CONFIGS = [
  PISTOL_CONFIG,
  PLASMA_RIFLE_CONFIG,
  SNIPER_RIFLE_CONFIG,
  ROOT_BIO_CARBINE_CONFIG,
] as const;

/** Default numbered-slot fill order (keys 1–3). */
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
