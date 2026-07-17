/**
 * Data-driven weapon feel matrix — the "ScriptableObject" layer.
 *
 * Every feel system (RecoilSystem, KickbackSystem, WeaponSway, juice) reads
 * its tuning from a WeaponFeelProfile. Profiles are authored per ARCHETYPE
 * and specialized per weapon id via WEAPON_FEEL_OVERRIDES — tweaking feel
 * never requires touching system code.
 *
 * Spray patterns themselves stay in src/content/weaponConfig.ts (RecoilConfig
 * .pattern) because they are per-weapon authored paths that the Armory stat
 * overlay already scales via cameraKickScale.
 */

import type { WeaponId } from '../../shared/content/weaponIds';
import type { RecoveryCurve } from './gunFeelMath';

export interface SpringParams {
  /** Hooke's-law k. Higher = faster snap. ω = √k; settle ≈ 6/ω seconds. */
  readonly stiffness: number;
  /** 1 = critically damped (no overshoot), <1 = springy, >1 = sluggish. */
  readonly dampingRatio: number;
}

export interface RecoilFeel {
  /** Error-margin: each pattern kick is jittered by ±bloom fraction. */
  readonly bloom: number;
  /** Wait after the last shot before bake (auto) or spring recovery (semi). */
  readonly recoveryDelaySec: number;
  /**
   * Legacy curve duration — unused. Semi/burst recover via Kickback camera
   * Hooke's-law springs instead.
   */
  readonly recoveryDurationSec: number;
  /** @deprecated Unused — recovery is spring-driven for non-auto. */
  readonly recoveryCurve: RecoveryCurve;
  /** How fast the view eases toward accumulated kick while firing. */
  readonly aimSmoothSpeed: number;
  /** Mouse angular speed (rad/s) where recoil smoothing starts engaging. */
  readonly smoothingThreshold: number;
  /** Max fraction of incoming recoil removed while fast-tracking (Apex-style). */
  readonly smoothingStrength: number;
}

export interface KickbackFeel {
  /** Spring for the physical viewmodel kick (translation + rotation). */
  readonly weaponSpring: SpringParams;
  /** Spring for the sharp camera view-kick impulse. */
  readonly cameraSpring: SpringParams;
  /** Impulse (m/s) shoving the weapon backward toward the camera (+Z view). */
  readonly kickBack: number;
  /** Impulse (m/s) lifting the grip vertically. */
  readonly kickUp: number;
  /** Impulse (rad/s) rotating the muzzle upward. */
  readonly kickPitch: number;
  /** Random side-to-side rotational jitter (rad/s). */
  readonly kickYawJitter: number;
  /** Random roll jitter (rad/s). */
  readonly kickRoll: number;
  /** Hard clamp on backward travel (m). */
  readonly maxBack: number;
  /** Hard clamp on muzzle-up rotation (rad). */
  readonly maxPitch: number;
  /** Camera view-kick pitch impulse (rad/s). */
  readonly cameraPitch: number;
  /** Camera view-kick random yaw impulse (rad/s). */
  readonly cameraYawJitter: number;
  /** Kick multiplier at full ADS. */
  readonly adsScale: number;
}

export interface LookLagFeel {
  /** Spring pulling the lagged weapon back in line with the camera. */
  readonly spring: SpringParams;
  /** How much of each look delta displaces the weapon (0 = rigid, 1 = loose). */
  readonly weight: number;
  /** Clamp on the lag angle (rad). */
  readonly maxRad: number;
  /** Translation coupling — meters of drift per radian of lag. */
  readonly posPerRad: number;
}

export interface BreathFeel {
  /** Idle sway multiplier while fully ADS (sniper scope wander). */
  readonly adsAmpMultiplier: number;
  /** Sway multiplier while holding breath (much steadier). */
  readonly holdSteadyScale: number;
  /** Seconds of breath before the hold gives out. */
  readonly holdDurationSec: number;
  /** Breath refill per second when not holding. */
  readonly recoverPerSec: number;
}

export interface SwayFeel {
  /** Figure-8 translation amplitude (m). */
  readonly idleAmp: number;
  /** Figure-8 rotation amplitude (rad). */
  readonly idleRotAmp: number;
  /** Figure-8 loop frequency (Hz). */
  readonly idleFreq: number;
  /** Layered-noise contribution as a fraction of idleAmp. */
  readonly noiseAmp: number;
  /** Sway amplitude / frequency multipliers while walking. */
  readonly walkAmpMultiplier: number;
  readonly walkFreqMultiplier: number;
  /** Sway multiplier at full ADS (before breath modifiers). */
  readonly adsScale: number;
  /** Weapon shift (m) opposite to strafe direction at full input. */
  readonly moveSwayAmp: number;
  /** Smoothing speed for the movement-sway offset. */
  readonly moveSwaySmoothing: number;
  readonly lookLag: LookLagFeel;
  /** Sniper-style breath mechanic; null for weapons without it. */
  readonly breath: BreathFeel | null;
}

export interface JuiceFeel {
  /** Peak opacity of the single-frame full-screen flash (0 = disabled). */
  readonly screenFlash: number;
  /** Shots inside one burst window before barrel smoke lingers on stop. */
  readonly smokeShotsToPrime: number;
  /** How long the barrel keeps smoking after fire stops. */
  readonly smokeDurationSec: number;
}

export interface WeaponFeelProfile {
  readonly recoil: RecoilFeel;
  readonly kickback: KickbackFeel;
  readonly sway: SwayFeel;
  readonly juice: JuiceFeel;
}

export type WeaponArchetype =
  | 'pistol'
  | 'ar'
  | 'lmg'
  | 'burst'
  | 'sniper'
  | 'shotgun'
  | 'melee';

/* ------------------------------------------------------------------ */
/* Archetype presets                                                    */
/* ------------------------------------------------------------------ */

/** Pistol (Wingman-style): light in the hands, huge snappy visual kick. */
const PISTOL_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0.07,
    recoveryDelaySec: 0.14,
    recoveryDurationSec: 0.16,
    recoveryCurve: 'easeOutExpo',
    aimSmoothSpeed: 20,
    smoothingThreshold: 1.6,
    smoothingStrength: 0.45,
  },
  kickback: {
    // ω = 42 → settles in ~0.14s: massive punch, instant recovery.
    weaponSpring: { stiffness: 1750, dampingRatio: 1 },
    cameraSpring: { stiffness: 1400, dampingRatio: 1 },
    kickBack: 9.5,
    kickUp: 1.6,
    kickPitch: 26,
    kickYawJitter: 3.2,
    kickRoll: 4.5,
    maxBack: 0.16,
    maxPitch: 0.5,
    cameraPitch: 2.4,
    cameraYawJitter: 0.55,
    adsScale: 0.6,
  },
  sway: {
    idleAmp: 0.0022,
    idleRotAmp: 0.0024,
    idleFreq: 0.5,
    noiseAmp: 0.35,
    walkAmpMultiplier: 2.1,
    walkFreqMultiplier: 2.3,
    adsScale: 0.2,
    moveSwayAmp: 0.014,
    moveSwaySmoothing: 9,
    // Very light gun — barely trails the camera.
    lookLag: {
      spring: { stiffness: 620, dampingRatio: 0.9 },
      weight: 0.28,
      maxRad: 0.05,
      posPerRad: 0.1,
    },
    breath: null,
  },
  juice: { screenFlash: 0, smokeShotsToPrime: 4, smokeDurationSec: 0.7 },
};

/** Assault rifle: rhythmic machine vibration, balanced weight. */
const AR_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0.09,
    recoveryDelaySec: 0.08,
    recoveryDurationSec: 0.28,
    recoveryCurve: 'easeOutQuart',
    aimSmoothSpeed: 18,
    smoothingThreshold: 1.6,
    smoothingStrength: 0.55,
  },
  kickback: {
    // ω = 33: fast enough to reset between rounds at 12 rps → visible rhythm.
    weaponSpring: { stiffness: 1100, dampingRatio: 0.95 },
    cameraSpring: { stiffness: 1000, dampingRatio: 1 },
    kickBack: 3.4,
    kickUp: 0.55,
    kickPitch: 8.5,
    kickYawJitter: 2.2,
    kickRoll: 2.4,
    maxBack: 0.09,
    maxPitch: 0.28,
    cameraPitch: 0.9,
    cameraYawJitter: 0.35,
    adsScale: 0.45,
  },
  sway: {
    idleAmp: 0.0028,
    idleRotAmp: 0.003,
    idleFreq: 0.42,
    noiseAmp: 0.4,
    walkAmpMultiplier: 2.2,
    walkFreqMultiplier: 2.5,
    adsScale: 0.22,
    moveSwayAmp: 0.02,
    moveSwaySmoothing: 7.5,
    // Noticeable but controlled trail.
    lookLag: {
      spring: { stiffness: 340, dampingRatio: 0.85 },
      weight: 0.55,
      maxRad: 0.085,
      posPerRad: 0.16,
    },
    breath: null,
  },
  juice: { screenFlash: 0, smokeShotsToPrime: 6, smokeDurationSec: 1.1 },
};

/** Light machine gun: heavy barrel, sustained vibration, slow to settle. */
const LMG_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0.11,
    recoveryDelaySec: 0.12,
    recoveryDurationSec: 0.4,
    recoveryCurve: 'easeOutQuart',
    aimSmoothSpeed: 14,
    smoothingThreshold: 1.7,
    smoothingStrength: 0.4,
  },
  kickback: {
    // Slower springs so mag dumps feel like a vibrating platform.
    weaponSpring: { stiffness: 620, dampingRatio: 0.92 },
    cameraSpring: { stiffness: 700, dampingRatio: 0.95 },
    kickBack: 4.2,
    kickUp: 0.7,
    kickPitch: 11,
    kickYawJitter: 2.8,
    kickRoll: 3.2,
    maxBack: 0.14,
    maxPitch: 0.38,
    cameraPitch: 1.15,
    cameraYawJitter: 0.42,
    adsScale: 0.55,
  },
  sway: {
    idleAmp: 0.0034,
    idleRotAmp: 0.0036,
    idleFreq: 0.38,
    noiseAmp: 0.5,
    walkAmpMultiplier: 2.5,
    walkFreqMultiplier: 2.3,
    adsScale: 0.28,
    moveSwayAmp: 0.028,
    moveSwaySmoothing: 6.5,
    lookLag: {
      spring: { stiffness: 220, dampingRatio: 0.88 },
      weight: 0.72,
      maxRad: 0.12,
      posPerRad: 0.2,
    },
    breath: null,
  },
  juice: { screenFlash: 0.04, smokeShotsToPrime: 8, smokeDurationSec: 1.6 },
};

/** Burst weapon: violent 3-hit micro-kick stack, hard pause, fast reset. */
const BURST_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0.06,
    recoveryDelaySec: 0.06,
    recoveryDurationSec: 0.17,
    recoveryCurve: 'easeOutExpo',
    aimSmoothSpeed: 22,
    smoothingThreshold: 1.6,
    smoothingStrength: 0.5,
  },
  kickback: {
    // Very stiff spring so each round in the burst reads as its own micro-hit.
    weaponSpring: { stiffness: 2100, dampingRatio: 0.92 },
    cameraSpring: { stiffness: 1600, dampingRatio: 1 },
    kickBack: 2.9,
    kickUp: 0.5,
    kickPitch: 7.5,
    kickYawJitter: 1.6,
    kickRoll: 2.0,
    maxBack: 0.08,
    maxPitch: 0.26,
    cameraPitch: 1.15,
    cameraYawJitter: 0.28,
    adsScale: 0.45,
  },
  sway: {
    idleAmp: 0.0026,
    idleRotAmp: 0.0028,
    idleFreq: 0.44,
    noiseAmp: 0.38,
    walkAmpMultiplier: 2.2,
    walkFreqMultiplier: 2.5,
    adsScale: 0.22,
    moveSwayAmp: 0.018,
    moveSwaySmoothing: 8,
    lookLag: {
      spring: { stiffness: 380, dampingRatio: 0.85 },
      weight: 0.5,
      maxRad: 0.08,
      posPerRad: 0.15,
    },
    breath: null,
  },
  juice: { screenFlash: 0, smokeShotsToPrime: 5, smokeDurationSec: 0.9 },
};

/** Sniper: violent displacement, slow recovery, heavy ADS sway + breath hold. */
const SNIPER_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0.05,
    recoveryDelaySec: 0.24,
    recoveryDurationSec: 0.55,
    recoveryCurve: 'easeOutCubic',
    aimSmoothSpeed: 11,
    smoothingThreshold: 1.9,
    smoothingStrength: 0.3,
  },
  kickback: {
    // ω ≈ 12.6 → ~0.5s settle: shoulder-bruising, slow to come home.
    weaponSpring: { stiffness: 160, dampingRatio: 0.9 },
    cameraSpring: { stiffness: 210, dampingRatio: 0.95 },
    kickBack: 4.6,
    kickUp: 0.9,
    kickPitch: 9.0,
    kickYawJitter: 2.6,
    kickRoll: 3.4,
    maxBack: 0.24,
    maxPitch: 0.62,
    cameraPitch: 1.5,
    cameraYawJitter: 0.6,
    adsScale: 0.85,
  },
  sway: {
    idleAmp: 0.0036,
    idleRotAmp: 0.004,
    idleFreq: 0.36,
    noiseAmp: 0.55,
    walkAmpMultiplier: 2.4,
    walkFreqMultiplier: 2.4,
    // Scope wander is the mechanic — breath multiplies on top of this.
    adsScale: 0.55,
    moveSwayAmp: 0.026,
    moveSwaySmoothing: 6,
    // Long heavy rifle drags behind fast flicks.
    lookLag: {
      spring: { stiffness: 165, dampingRatio: 0.95 },
      weight: 0.85,
      maxRad: 0.13,
      posPerRad: 0.22,
    },
    breath: {
      adsAmpMultiplier: 2.6,
      holdSteadyScale: 0.12,
      holdDurationSec: 3.5,
      recoverPerSec: 0.45,
    },
  },
  juice: { screenFlash: 0.12, smokeShotsToPrime: 1, smokeDurationSec: 1.6 },
};

/** Shotgun: pump-action slam — between pistol snap and sniper weight. */
const SHOTGUN_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0.08,
    recoveryDelaySec: 0.18,
    recoveryDurationSec: 0.4,
    recoveryCurve: 'easeOutQuart',
    aimSmoothSpeed: 14,
    smoothingThreshold: 1.7,
    smoothingStrength: 0.35,
  },
  kickback: {
    weaponSpring: { stiffness: 480, dampingRatio: 0.92 },
    cameraSpring: { stiffness: 520, dampingRatio: 1 },
    kickBack: 6.4,
    kickUp: 1.1,
    kickPitch: 13,
    kickYawJitter: 3.0,
    kickRoll: 3.6,
    maxBack: 0.2,
    maxPitch: 0.5,
    cameraPitch: 1.7,
    cameraYawJitter: 0.5,
    adsScale: 0.7,
  },
  sway: {
    idleAmp: 0.003,
    idleRotAmp: 0.0032,
    idleFreq: 0.4,
    noiseAmp: 0.42,
    walkAmpMultiplier: 2.3,
    walkFreqMultiplier: 2.4,
    adsScale: 0.3,
    moveSwayAmp: 0.022,
    moveSwaySmoothing: 6.5,
    lookLag: {
      spring: { stiffness: 240, dampingRatio: 0.9 },
      weight: 0.65,
      maxRad: 0.1,
      posPerRad: 0.18,
    },
    breath: null,
  },
  juice: { screenFlash: 0.09, smokeShotsToPrime: 1, smokeDurationSec: 1.3 },
};

/** Melee: inert — slash feel lives in WeaponPose, never fires the systems. */
const MELEE_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0,
    recoveryDelaySec: 0,
    recoveryDurationSec: 0.1,
    recoveryCurve: 'easeOutCubic',
    aimSmoothSpeed: 24,
    smoothingThreshold: 99,
    smoothingStrength: 0,
  },
  kickback: {
    weaponSpring: { stiffness: 900, dampingRatio: 1 },
    cameraSpring: { stiffness: 900, dampingRatio: 1 },
    kickBack: 0,
    kickUp: 0,
    kickPitch: 0,
    kickYawJitter: 0,
    kickRoll: 0,
    maxBack: 0.1,
    maxPitch: 0.3,
    cameraPitch: 0,
    cameraYawJitter: 0,
    adsScale: 1,
  },
  sway: {
    idleAmp: 0.0034,
    idleRotAmp: 0.0038,
    idleFreq: 0.46,
    noiseAmp: 0.45,
    walkAmpMultiplier: 2.2,
    walkFreqMultiplier: 2.5,
    adsScale: 1,
    moveSwayAmp: 0.016,
    moveSwaySmoothing: 8,
    lookLag: {
      spring: { stiffness: 520, dampingRatio: 0.9 },
      weight: 0.35,
      maxRad: 0.06,
      posPerRad: 0.12,
    },
    breath: null,
  },
  juice: { screenFlash: 0, smokeShotsToPrime: 99, smokeDurationSec: 0 },
};

export const ARCHETYPE_FEEL: Record<WeaponArchetype, WeaponFeelProfile> = {
  pistol: PISTOL_FEEL,
  ar: AR_FEEL,
  lmg: LMG_FEEL,
  burst: BURST_FEEL,
  sniper: SNIPER_FEEL,
  shotgun: SHOTGUN_FEEL,
  melee: MELEE_FEEL,
};

/* ------------------------------------------------------------------ */
/* Per-weapon assignment + overrides                                    */
/* ------------------------------------------------------------------ */

export const WEAPON_ARCHETYPES: Record<WeaponId, WeaponArchetype> = {
  pistol: 'pistol',
  plasma_rifle: 'ar',
  bio_liquid_rifle: 'ar',
  bio_machine_gun: 'lmg',
  root_bio_carbine: 'burst',
  sniper_rifle: 'sniper',
  plasma_shotgun: 'shotgun',
  katana: 'melee',
};

type FeelOverride = {
  readonly [K in keyof WeaponFeelProfile]?: Partial<WeaponFeelProfile[K]>;
};

/** Per-weapon deltas on top of the archetype preset. */
const WEAPON_FEEL_OVERRIDES: Partial<Record<WeaponId, FeelOverride>> = {
  // Viscous heavy auto — slower vibration, more shove than the plasma rifle.
  bio_liquid_rifle: {
    kickback: {
      weaponSpring: { stiffness: 760, dampingRatio: 0.95 },
      kickBack: 4.6,
      kickPitch: 10.5,
      kickRoll: 3.0,
    },
    sway: {
      idleAmp: 0.0031,
      moveSwayAmp: 0.023,
      lookLag: {
        spring: { stiffness: 260, dampingRatio: 0.88 },
        weight: 0.65,
        maxRad: 0.1,
        posPerRad: 0.18,
      },
    },
    juice: { screenFlash: 0.05, smokeShotsToPrime: 5, smokeDurationSec: 1.3 },
  },
};

function mergeProfile(base: WeaponFeelProfile, override?: FeelOverride): WeaponFeelProfile {
  if (!override) return base;
  return {
    recoil: { ...base.recoil, ...override.recoil },
    kickback: { ...base.kickback, ...override.kickback },
    sway: { ...base.sway, ...override.sway },
    juice: { ...base.juice, ...override.juice },
  };
}

const PROFILE_CACHE = new Map<string, WeaponFeelProfile>();

export function getWeaponFeelProfile(weaponId: string): WeaponFeelProfile {
  let profile = PROFILE_CACHE.get(weaponId);
  if (!profile) {
    const archetype = (WEAPON_ARCHETYPES as Record<string, WeaponArchetype>)[weaponId] ?? 'ar';
    profile = mergeProfile(ARCHETYPE_FEEL[archetype], WEAPON_FEEL_OVERRIDES[weaponId as WeaponId]);
    PROFILE_CACHE.set(weaponId, profile);
  }
  return profile;
}
