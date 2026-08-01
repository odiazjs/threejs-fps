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
  /**
   * 0–1: how strongly pitch springs lead back-travel (graph rule — pitch peaks
   * first). Higher = wider rotational lead (sniper).
   */
  readonly pitchLead: number;
  /**
   * 0–1: wrist-flick arc vs linear slide. 1 = full arc around the pivot
   * (muzzle up / stock down).
   */
  readonly curveAmount: number;
  /** Local pivot Y (m). Negative = below grip. */
  readonly pivotY: number;
  /**
   * Local pivot Z (m). Negative = toward muzzle so the stock dips on pitch-up
   * (wrist flick). Positive = toward camera/stock.
   */
  readonly pivotZ: number;
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
  /** Slow breathing bob on Y while idle (m). */
  readonly idleBobAmp: number;
  /** Breathing bob frequency (Hz). */
  readonly idleBobFreq: number;
  /** Sway amplitude / frequency multipliers while walking. */
  readonly walkAmpMultiplier: number;
  readonly walkFreqMultiplier: number;
  /** Footstep-synced vertical weapon bob while walking (m). */
  readonly walkBobAmp: number;
  /** Footstep-synced lateral weapon bob while walking (m). */
  readonly walkBobLateralAmp: number;
  /** Sway multiplier at full ADS for weapon + camera (before breath modifiers). */
  readonly adsScale: number;
  /**
   * Extra multiplier on idle figure-8 / noise / camera breathe while hipfire
   * and standing still (default 1). Does not affect walk, strafe, jump/land.
   */
  readonly hipIdleSwayScale?: number;
  /**
   * When set, HUD crosshair ADS sway uses this scale instead of {@link adsScale}
   * (lets sniper keep a floating reticle while the gun stays steady).
   */
  readonly crosshairAdsScale?: number;
  /** Extra multiplier on crosshair ADS sway (e.g. 1.15 = +15%). */
  readonly crosshairAdsBoost?: number;
  /** Weapon shift (m) opposite to strafe direction at full input. */
  readonly moveSwayAmp: number;
  /** Smoothing speed for the movement-sway offset. */
  readonly moveSwaySmoothing: number;
  /** Extra roll (rad) from strafe at full input. */
  readonly strafeRollAmp: number;
  /** Extra pitch (rad) from strafe at full input. */
  readonly strafePitchAmp: number;
  /** Jump impulse: weapon Y velocity kick (m/s into spring). */
  readonly jumpKick: number;
  /** Jump impulse: pitch velocity kick (rad/s into spring). */
  readonly jumpPitchKick: number;
  /** Land impulse: weapon Y velocity kick (negative = dip). */
  readonly landKick: number;
  /** Land impulse: pitch velocity kick (rad/s). */
  readonly landPitchKick: number;
  /** How much vertical velocity pulls the gun while airborne (s). */
  readonly airborneInertia: number;
  /** Fraction of jump/land pitch mirrored onto the camera rigs. */
  readonly landCameraScale: number;
  readonly lookLag: LookLagFeel;
  /**
   * Look-lag (weapon trailing mouse flicks) multiplier at full ADS.
   * 1 = unchanged; 0 = no mouse-drag lag while scoped.
   */
  readonly lookLagAdsScale: number;
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
  /** Barrel-smoke opacity multiplier (default 1). */
  readonly smokeOpacityScale?: number;
  /** Barrel-smoke particle size multiplier (default 1). */
  readonly smokeSizeScale?: number;
  /** Emit denser smoke while trail is active (default 1). */
  readonly smokeDensityScale?: number;
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

/** Pistol: light in the hands, soft snappy kick (low base recoil). */
const PISTOL_FEEL: WeaponFeelProfile = {
  recoil: {
    bloom: 0.03,
    recoveryDelaySec: 0.1,
    recoveryDurationSec: 0.14,
    recoveryCurve: 'easeOutExpo',
    aimSmoothSpeed: 22,
    smoothingThreshold: 1.6,
    smoothingStrength: 0.45,
  },
  kickback: {
    // Graph: fast curved snap — pitch peaks first, springy overshoot, quick settle.
    weaponSpring: { stiffness: 1550, dampingRatio: 0.58 },
    cameraSpring: { stiffness: 1200, dampingRatio: 0.9 },
    kickBack: 8.2,
    kickUp: 0.4,
    kickPitch: 14.5,
    kickYawJitter: 2.2,
    kickRoll: 3.4,
    maxBack: 0.14,
    maxPitch: 0.16,
    cameraPitch: 0,
    cameraYawJitter: 0,
    adsScale: 0.62,
    pitchLead: 0.55,
    curveAmount: 0.95,
    pivotY: -0.028,
    pivotZ: -0.07,
  },
  sway: {
    idleAmp: 0.003,
    idleRotAmp: 0.0032,
    idleFreq: 0.52,
    noiseAmp: 0.42,
    idleBobAmp: 0.0014,
    idleBobFreq: 0.28,
    walkAmpMultiplier: 2.2,
    walkFreqMultiplier: 2.3,
    walkBobAmp: 0.006,
    walkBobLateralAmp: 0.0035,
    adsScale: 0.2,
    moveSwayAmp: 0.02,
    moveSwaySmoothing: 8,
    strafeRollAmp: 0.045,
    strafePitchAmp: 0.012,
    jumpKick: 0.9,
    jumpPitchKick: 1.8,
    landKick: -2.4,
    landPitchKick: 3.2,
    airborneInertia: 0.012,
    landCameraScale: 0.3,
    // Very light gun — barely trails the camera.
    lookLag: {
      spring: { stiffness: 620, dampingRatio: 0.9 },
      weight: 0.28,
      maxRad: 0.05,
      posPerRad: 0.1,
    },
    lookLagAdsScale: 1,
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
    // Springy wrist flick on every round — camera climb stays in RecoilSystem.
    weaponSpring: { stiffness: 980, dampingRatio: 0.62 },
    cameraSpring: { stiffness: 1000, dampingRatio: 1 },
    kickBack: 6.8,
    kickUp: 0.42,
    kickPitch: 7.8,
    kickYawJitter: 2.0,
    kickRoll: 2.4,
    maxBack: 0.16,
    maxPitch: 0.14,
    cameraPitch: 0,
    cameraYawJitter: 0,
    adsScale: 0.45,
    pitchLead: 0.48,
    curveAmount: 0.9,
    pivotY: -0.035,
    pivotZ: -0.09,
  },
  sway: {
    idleAmp: 0.0036,
    idleRotAmp: 0.0038,
    idleFreq: 0.42,
    noiseAmp: 0.48,
    idleBobAmp: 0.0018,
    idleBobFreq: 0.24,
    walkAmpMultiplier: 2.3,
    walkFreqMultiplier: 2.5,
    walkBobAmp: 0.008,
    walkBobLateralAmp: 0.0045,
    adsScale: 0.22,
    moveSwayAmp: 0.028,
    moveSwaySmoothing: 6.5,
    strafeRollAmp: 0.06,
    strafePitchAmp: 0.016,
    jumpKick: 1.1,
    jumpPitchKick: 2.2,
    landKick: -3.0,
    landPitchKick: 4.0,
    airborneInertia: 0.016,
    landCameraScale: 0.32,
    // Noticeable but controlled trail.
    lookLag: {
      spring: { stiffness: 340, dampingRatio: 0.85 },
      weight: 0.55,
      maxRad: 0.085,
      posPerRad: 0.16,
    },
    lookLagAdsScale: 1,
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
    // Heavy barrel — springy shove with capped tip so mag dumps stay readable.
    weaponSpring: { stiffness: 720, dampingRatio: 0.6 },
    cameraSpring: { stiffness: 800, dampingRatio: 0.95 },
    kickBack: 9.0,
    kickUp: 0.5,
    kickPitch: 6.2,
    kickYawJitter: 2.2,
    kickRoll: 2.8,
    maxBack: 0.24,
    maxPitch: 0.12,
    cameraPitch: 0,
    cameraYawJitter: 0,
    adsScale: 0.5,
    pitchLead: 0.42,
    curveAmount: 0.86,
    pivotY: -0.04,
    pivotZ: -0.1,
  },
  sway: {
    idleAmp: 0.0042,
    idleRotAmp: 0.0044,
    idleFreq: 0.36,
    noiseAmp: 0.55,
    idleBobAmp: 0.0022,
    idleBobFreq: 0.2,
    walkAmpMultiplier: 2.6,
    walkFreqMultiplier: 2.3,
    walkBobAmp: 0.01,
    walkBobLateralAmp: 0.0055,
    adsScale: 0.28,
    moveSwayAmp: 0.036,
    moveSwaySmoothing: 5.5,
    strafeRollAmp: 0.075,
    strafePitchAmp: 0.02,
    jumpKick: 1.35,
    jumpPitchKick: 2.6,
    landKick: -3.8,
    landPitchKick: 4.8,
    airborneInertia: 0.02,
    landCameraScale: 0.36,
    lookLag: {
      spring: { stiffness: 220, dampingRatio: 0.88 },
      weight: 0.72,
      maxRad: 0.12,
      posPerRad: 0.2,
    },
    lookLagAdsScale: 1,
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
    // Stiff but underdamped — each burst round reads as its own springy flick.
    weaponSpring: { stiffness: 1800, dampingRatio: 0.58 },
    cameraSpring: { stiffness: 1600, dampingRatio: 1 },
    kickBack: 5.8,
    kickUp: 0.38,
    kickPitch: 7.2,
    kickYawJitter: 1.6,
    kickRoll: 2.0,
    maxBack: 0.14,
    maxPitch: 0.13,
    cameraPitch: 0,
    cameraYawJitter: 0,
    adsScale: 0.45,
    pitchLead: 0.52,
    curveAmount: 0.92,
    pivotY: -0.03,
    pivotZ: -0.075,
  },
  sway: {
    idleAmp: 0.0034,
    idleRotAmp: 0.0036,
    idleFreq: 0.44,
    noiseAmp: 0.45,
    idleBobAmp: 0.0016,
    idleBobFreq: 0.26,
    walkAmpMultiplier: 2.3,
    walkFreqMultiplier: 2.5,
    walkBobAmp: 0.0075,
    walkBobLateralAmp: 0.004,
    adsScale: 0.22,
    moveSwayAmp: 0.026,
    moveSwaySmoothing: 7,
    strafeRollAmp: 0.055,
    strafePitchAmp: 0.014,
    jumpKick: 1.05,
    jumpPitchKick: 2.0,
    landKick: -2.8,
    landPitchKick: 3.6,
    airborneInertia: 0.014,
    landCameraScale: 0.3,
    lookLag: {
      spring: { stiffness: 380, dampingRatio: 0.85 },
      weight: 0.5,
      maxRad: 0.08,
      posPerRad: 0.15,
    },
    lookLagAdsScale: 1,
    breath: null,
  },
  juice: { screenFlash: 0, smokeShotsToPrime: 5, smokeDurationSec: 0.9 },
};

/** Sniper: violent displacement, slow recovery, light ADS sway + breath hold. */
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
    // Graph: hard impulse, larger pitch lead, weighty springy return.
    weaponSpring: { stiffness: 260, dampingRatio: 0.62 },
    cameraSpring: { stiffness: 380, dampingRatio: 0.9 },
    kickBack: 11.5,
    kickUp: 0.65,
    kickPitch: 17.5,
    kickYawJitter: 2.6,
    kickRoll: 3.8,
    maxBack: 0.22,
    maxPitch: 0.22,
    cameraPitch: 0,
    cameraYawJitter: 0,
    adsScale: 0.48,
    pitchLead: 0.65,
    curveAmount: 0.97,
    pivotY: -0.04,
    pivotZ: -0.14,
  },
  sway: {
    idleAmp: 0.0048,
    idleRotAmp: 0.0056,
    idleFreq: 0.3,
    noiseAmp: 0.65,
    idleBobAmp: 0.003,
    idleBobFreq: 0.17,
    walkAmpMultiplier: 2.5,
    walkFreqMultiplier: 2.4,
    walkBobAmp: 0.009,
    walkBobLateralAmp: 0.005,
    // Strong idle hipfire aim float only; locomotion keeps normal amps.
    hipIdleSwayScale: 3.8,
    // Weapon / camera nearly frozen while scoped — reticle carries the wander.
    adsScale: 0.03,
    // Prior ADS sway amount (0.34) for the HUD cross, then +15%.
    crosshairAdsScale: 0.34,
    crosshairAdsBoost: 1.15,
    moveSwayAmp: 0.016,
    moveSwaySmoothing: 5.5,
    strafeRollAmp: 0.05,
    strafePitchAmp: 0.014,
    jumpKick: 1.2,
    jumpPitchKick: 2.4,
    landKick: -3.2,
    landPitchKick: 4.2,
    airborneInertia: 0.018,
    landCameraScale: 0.22,
    // Hipfire: long heavy rifle drags behind fast flicks. ADS: light lag only.
    lookLag: {
      spring: { stiffness: 165, dampingRatio: 0.95 },
      weight: 0.85,
      maxRad: 0.13,
      posPerRad: 0.22,
    },
    lookLagAdsScale: 0.1,
    breath: {
      // Scope wander on the crosshair; Shift hold-breath steadies but does not freeze.
      adsAmpMultiplier: 0.78,
      holdSteadyScale: 0.14,
      holdDurationSec: 3.2,
      recoverPerSec: 0.4,
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
    weaponSpring: { stiffness: 420, dampingRatio: 0.6 },
    cameraSpring: { stiffness: 520, dampingRatio: 0.95 },
    kickBack: 11.0,
    kickUp: 0.65,
    kickPitch: 11.5,
    kickYawJitter: 2.6,
    kickRoll: 3.4,
    maxBack: 0.26,
    maxPitch: 0.2,
    cameraPitch: 0,
    cameraYawJitter: 0,
    adsScale: 0.65,
    pitchLead: 0.55,
    curveAmount: 0.93,
    pivotY: -0.038,
    pivotZ: -0.11,
  },
  sway: {
    idleAmp: 0.0038,
    idleRotAmp: 0.004,
    idleFreq: 0.4,
    noiseAmp: 0.5,
    idleBobAmp: 0.002,
    idleBobFreq: 0.22,
    walkAmpMultiplier: 2.4,
    walkFreqMultiplier: 2.4,
    walkBobAmp: 0.0095,
    walkBobLateralAmp: 0.005,
    adsScale: 0.3,
    moveSwayAmp: 0.032,
    moveSwaySmoothing: 5.8,
    strafeRollAmp: 0.07,
    strafePitchAmp: 0.018,
    jumpKick: 1.3,
    jumpPitchKick: 2.5,
    landKick: -3.6,
    landPitchKick: 4.6,
    airborneInertia: 0.019,
    landCameraScale: 0.34,
    lookLag: {
      spring: { stiffness: 240, dampingRatio: 0.9 },
      weight: 0.65,
      maxRad: 0.1,
      posPerRad: 0.18,
    },
    lookLagAdsScale: 1,
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
    pitchLead: 0,
    curveAmount: 0,
    pivotY: 0,
    pivotZ: 0,
  },
  sway: {
    idleAmp: 0.004,
    idleRotAmp: 0.0044,
    idleFreq: 0.46,
    noiseAmp: 0.5,
    idleBobAmp: 0.0018,
    idleBobFreq: 0.26,
    walkAmpMultiplier: 2.3,
    walkFreqMultiplier: 2.5,
    walkBobAmp: 0.007,
    walkBobLateralAmp: 0.004,
    adsScale: 1,
    moveSwayAmp: 0.022,
    moveSwaySmoothing: 7,
    strafeRollAmp: 0.05,
    strafePitchAmp: 0.014,
    jumpKick: 1.0,
    jumpPitchKick: 2.0,
    landKick: -2.6,
    landPitchKick: 3.4,
    airborneInertia: 0.014,
    landCameraScale: 0.28,
    lookLag: {
      spring: { stiffness: 520, dampingRatio: 0.9 },
      weight: 0.35,
      maxRad: 0.06,
      posPerRad: 0.12,
    },
    lookLagAdsScale: 1,
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
  bio_smg_1: 'ar',
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
      weaponSpring: { stiffness: 680, dampingRatio: 0.58 },
      kickBack: 8.0,
      kickPitch: 6.8,
      kickRoll: 2.6,
      maxBack: 0.2,
      maxPitch: 0.15,
      pitchLead: 0.45,
      curveAmount: 0.88,
      pivotY: -0.038,
      pivotZ: -0.1,
    },
    sway: {
      idleAmp: 0.0038,
      moveSwayAmp: 0.032,
      walkBobAmp: 0.009,
      landKick: -3.4,
      landPitchKick: 4.4,
      lookLag: {
        spring: { stiffness: 260, dampingRatio: 0.88 },
        weight: 0.65,
        maxRad: 0.1,
        posPerRad: 0.18,
      },
    },
    juice: { screenFlash: 0.05, smokeShotsToPrime: 5, smokeDurationSec: 1.3 },
  },
  // Heavy bio LMG — thick lingering barrel smoke after sustained fire.
  bio_machine_gun: {
    juice: {
      screenFlash: 0.07,
      smokeShotsToPrime: 4,
      smokeDurationSec: 2.8,
      smokeOpacityScale: 2.4,
      smokeSizeScale: 2.0,
      smokeDensityScale: 2.0,
    },
  },
  // Compact SMG — quick springy flick, light smoke from mag dumps.
  bio_smg_1: {
    kickback: {
      weaponSpring: { stiffness: 1400, dampingRatio: 0.55 },
      kickBack: 5.2,
      kickPitch: 6.0,
      kickRoll: 2.0,
      maxBack: 0.12,
      maxPitch: 0.11,
      pitchLead: 0.5,
      curveAmount: 0.9,
      pivotY: -0.03,
      pivotZ: -0.08,
    },
    juice: {
      screenFlash: 0.035,
      smokeShotsToPrime: 8,
      smokeDurationSec: 1.0,
      smokeOpacityScale: 1.1,
      smokeSizeScale: 0.9,
    },
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
