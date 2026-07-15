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
  // Authored for RECOIL_STAT_REFERENCE (50). Runtime: cameraKickScale = recoilStat / 50.
  // Positive pitch = camera kicks upward (aim rig X).
  const pattern: RecoilKick[] = [];

  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    const pitch = 0.02 + t * 0.024;

    let yaw: number;
    if (i < 7) {
      yaw = 0.006;
    } else if (i < 15) {
      yaw = -0.0075;
    } else if (i < 23) {
      yaw = 0.0065;
    } else {
      yaw = -0.0055;
    }

    pattern.push({ pitch, yaw });
  }

  return pattern;
}

/** Semi-auto sidearm: heavy single-shot kick. */
function buildPistolRecoilPattern(): RecoilKick[] {
  return Array.from({ length: 12 }, (_, i) => ({
    pitch: 0.085,
    yaw: (i % 2 === 0 ? 1 : -1) * 0.014,
  }));
}

/** Bolt-action sniper: punishing single-shot kick. */
function buildSniperRecoilPattern(): RecoilKick[] {
  return Array.from({ length: 8 }, (_, i) => ({
    pitch: 0.12,
    yaw: (i % 2 === 0 ? 1 : -1) * 0.028,
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
    glowLayers: 2,
    particleSizeScale: 1.15,
    sideVents: {
      particleCount: 2,
      particleSpeed: 4,
      lateralBias: 0.22,
      particleSizeScale: 0.08,
      streakCount: 0,
      durationScale: 0.55,
    },
  },
  sway: { intensity: 0.95 },
  sounds: {
    autoShot: { src: '/sounds/rifle_auto_3.wav', reverbLevel: 0 },
    reload: { src: '/sounds/rifle_reload_1.wav', reverbLevel: 0 },
    volume: 0.2,
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
    sideVents: {
      particleCount: 1,
      particleSpeed: 3,
      lateralBias: 0.18,
      particleSizeScale: 0.06,
      streakCount: 0,
      durationScale: 0.45,
    },
  },
  sway: { intensity: 1.08 },
  sounds: {
    singleShot: { src: '/sounds/pistol_8.wav', reverbLevel: 0 },
    reload: { src: '/sounds/pistol_reload_1.wav', reverbLevel: 0 },
    volume: 0.2,
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
    singleShot: { src: '/sounds/katana_melee_sound_1.wav', reverbLevel: 0 },
    volume: 0.2,
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
    sideVents: {
      particleCount: 2,
      particleSpeed: 5,
      lateralBias: 0.2,
      particleSizeScale: 0.08,
      streakCount: 0,
      durationScale: 0.5,
    },
  },
  sway: { intensity: 0.15 },
  sounds: {
    singleShot: { src: '/sounds/sniper_3.wav', reverbLevel: 0.5 },
    reload: { src: '/sounds/sniper_reload_1.wav', reverbLevel: 0.08 },
    volume: 0.45,
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
    ads: { x: 0, y: -0.188, z: -0.22 },
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
    sideVents: {
      particleCount: 2,
      particleSpeed: 4,
      lateralBias: 0.22,
      particleSizeScale: 0.08,
      streakCount: 0,
      durationScale: 0.55,
    },
  },
  sway: { intensity: 0.92 },
  sounds: {
    singleShot: { src: '/sounds/root_bio_carbine.wav', reverbLevel: 0 },
    reload: { src: '/sounds/root_bio_carbine_reload.wav', reverbLevel: 0 },
    volume: 0.2,
  },
};

function buildBioLiquidRifleRecoilPattern(): RecoilKick[] {
  // Same climb shape as plasma — higher Armory recoil (70 vs 35) supplies the extra kick.
  return buildPlasmaRifleRecoilPattern();
}

/** Viscous bio-energy auto rifle — heavier hit and kick than the plasma rifle. */
export const BIO_LIQUID_RIFLE_CONFIG: WeaponConfig = {
  id: 'bio_liquid_rifle',
  name: 'Bio-Liquid Rifle',
  clipSize: SHIPPED_WEAPON_BASE_STATS.bio_liquid_rifle.magazineSize,
  reloadSec: WEAPON_RELOAD_SEC.bio_liquid_rifle,
  reserveClips: 3,
  fireRate: SHIPPED_WEAPON_BASE_STATS.bio_liquid_rifle.fireRate,
  fireMode: 'auto',
  damage: WEAPON_DAMAGE.bio_liquid_rifle,
  adsTime: SHIPPED_WEAPON_BASE_STATS.bio_liquid_rifle.adsTime,
  projectileSpeed: 290,
  projectileStyle: 'bioLiquid',
  projectileGravity: 28,
  maxHitDistance: WEAPON_MAX_HIT_DISTANCE.bio_liquid_rifle,
  view: {
    hip: { x: 0.15, y: -0.25, z: -0.35 },
    ads: { x: 0, y: -0.195, z: -0.22 },
    adsFov: 60,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildBioLiquidRifleRecoilPattern(),
    recoverySpeed: 7.5,
    recoveryDelaySec: 0.1,
    aimSmoothSpeed: 16,
    adsMultiplier: 0.55,
    yawScale: 1.15,
    visualKick: 0.78,
    visualRecoverySpeed: 11,
    adsVisualMultiplier: 0.5,
    visualStyle: {
      rotX: 0.42,
      rotYFromYaw: -0.16,
      rotZ: -0.14,
      posXFromYaw: -0.04,
      posY: -0.04,
      posZ: 0,
      kickBack: 0.22,
      kickUp: -0.028,
    },
  },
  muzzleFlash: {
    coreScale: 0.14,
    duration: 0.1,
    particleCount: 14,
    particleSpeed: 8,
    particleSpread: 0.85,
    colors: [0xb8ff3a, 0x5cff7a, 0x1faa4a],
    lightIntensity: 2.2,
    lightDistance: 3.2,
    glowScale: 0.55,
    glowLayers: 2,
    particleSizeScale: 0.1,
    particleFall: 22,
    sideVents: {
      particleCount: 2,
      particleSpeed: 4,
      lateralBias: 0.24,
      particleSizeScale: 0.08,
      streakCount: 0,
      durationScale: 0.55,
      colors: [0xb8ff3a, 0x5cff7a, 0x1faa4a],
    },
  },
  sway: { intensity: 1.05 },
  sounds: {
    singleShot: { src: '/sounds/bio_liquid_shot_1.wav', reverbLevel: 0 },
    reload: { src: '/sounds/bio_liquid_rifle_reload.wav', reverbLevel: 0 },
    volume: 0.65,
  },
};

function buildPlasmaShotgunRecoilPattern(): RecoilKick[] {
  // Heavy pump kick — one hard punch with a little yaw sway across the mag.
  return Array.from({ length: 4 }, (_, i) => ({
    pitch: 0.11,
    yaw: (i % 2 === 0 ? 1 : -1) * 0.028,
  }));
}

/** Close-range plasma scattergun — 6 pellets per shell, damage is per pellet. */
export const PLASMA_SHOTGUN_CONFIG: WeaponConfig = {
  id: 'plasma_shotgun',
  name: 'Plasma Shotgun',
  clipSize: SHIPPED_WEAPON_BASE_STATS.plasma_shotgun.magazineSize,
  reloadSec: WEAPON_RELOAD_SEC.plasma_shotgun,
  reloadStyle: 'shell',
  reserveClips: 3,
  fireRate: SHIPPED_WEAPON_BASE_STATS.plasma_shotgun.fireRate,
  fireMode: 'semi',
  pelletCount: 6,
  pelletSpreadRad: 0.095,
  pelletAdsSpreadScale: 0.55,
  damage: WEAPON_DAMAGE.plasma_shotgun,
  adsTime: SHIPPED_WEAPON_BASE_STATS.plasma_shotgun.adsTime,
  projectileSpeed: 340,
  maxHitDistance: WEAPON_MAX_HIT_DISTANCE.plasma_shotgun,
  view: {
    hip: { x: 0.16, y: -0.26, z: -0.38 },
    ads: { x: 0, y: -0.175, z: -0.26 },
    adsFov: 64,
    localMeshEuler: { x: 0, y: Math.PI, z: 0 },
    remoteHand: { x: 0, y: 0, z: 0 },
    remoteMeshEuler: { x: 0, y: 0, z: 0 },
  },
  recoil: {
    pattern: buildPlasmaShotgunRecoilPattern(),
    recoverySpeed: 5.5,
    recoveryDelaySec: 0.18,
    aimSmoothSpeed: 14,
    adsMultiplier: 0.7,
    yawScale: 1.25,
    visualKick: 1.35,
    visualRecoverySpeed: 8,
    adsVisualMultiplier: 0.65,
    visualStyle: {
      rotX: 0.85,
      rotYFromYaw: -0.28,
      rotZ: -0.22,
      posXFromYaw: -0.06,
      posY: -0.06,
      posZ: 0,
      kickBack: 0.98,
      kickUp: -0.09,
    },
  },
  muzzleFlash: {
    coreScale: 0.34,
    duration: 0.17,
    particleCount: 38,
    particleSpeed: 34,
    // Wide lateral scatter — the blast fans out instead of a single tongue.
    particleSpread: 2.9,
    colors: [0xe8f7ff, 0x6ecbff, 0x3a7dff],
    lightIntensity: 7.5,
    lightDistance: 8.5,
    glowScale: 0.95,
    glowLayers: 3,
    particleSizeScale: 1.8,
    // One streak per pellet, on the same cone as pelletSpreadRad — the flash
    // itself reads as six projectiles leaving the barrels.
    streakCount: 6,
    streakSpreadRad: 0.105,
    sideVents: {
      particleCount: 32,
      particleSpeed: 32,
      lateralBias: 0.125,
      particleSizeScale: 0.1,
      streakCount: 16,
      durationScale: 1.2,
    },
  },
  sway: { intensity: 1.2 },
  sounds: {
    singleShot: { src: '/sounds/shotgun_shot_1.wav', reverbLevel: 0 },
    reload: { src: '/sounds/plasma_shotgun_partial_reload.wav', reverbLevel: 0 },
    reloadPartial: { src: '/sounds/plasma_shotgun_partial_reload.wav', reverbLevel: 0 },
    reloadComplete: { src: '/sounds/plasma_shotgun_complete_reload.wav', reverbLevel: 0 },
    volume: 0.65,
  },
};

export const WEAPON_CONFIGS: Record<WeaponId, WeaponConfig> = {
  plasma_rifle: PLASMA_RIFLE_CONFIG,
  pistol: PISTOL_CONFIG,
  sniper_rifle: SNIPER_RIFLE_CONFIG,
  root_bio_carbine: ROOT_BIO_CARBINE_CONFIG,
  bio_liquid_rifle: BIO_LIQUID_RIFLE_CONFIG,
  plasma_shotgun: PLASMA_SHOTGUN_CONFIG,
  katana: KATANA_CONFIG,
};

/** All guns that can occupy numbered loadout slots (includes non-default pickables). */
export const PICKABLE_WEAPON_CONFIGS = [
  PISTOL_CONFIG,
  PLASMA_RIFLE_CONFIG,
  SNIPER_RIFLE_CONFIG,
  ROOT_BIO_CARBINE_CONFIG,
  BIO_LIQUID_RIFLE_CONFIG,
  PLASMA_SHOTGUN_CONFIG,
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
