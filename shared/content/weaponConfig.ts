import type { WeaponId } from './weaponIds.js';

export interface WeaponViewOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Per-weapon hip / ADS weapon position and ADS zoom (tune in weapon configs). */
export interface WeaponViewConfig {
  readonly hip: WeaponViewOffset;
  readonly ads: WeaponViewOffset;
  /** Camera FOV when fully ADS (higher = less zoom). Defaults to 68. */
  readonly adsFov?: number;
  /** Extra euler (radians) added on first-person attach rotation. */
  readonly localMeshEuler?: WeaponViewOffset;
  /** Extra euler (radians) added on third-person attach rotation. */
  readonly remoteMeshEuler?: WeaponViewOffset;
  /** Local offset from the right-hand bone for third-person weapon attach. */
  readonly remoteHand?: WeaponViewOffset;
}

export interface RecoilKick {
  /** Radians added to pitch per shot (negative kicks the view upward). */
  readonly pitch: number;
  /** Radians added to yaw per shot. */
  readonly yaw: number;
}

export interface RecoilConfig {
  /** Per-shot kicks; index wraps for sustained fire. */
  readonly pattern: readonly RecoilKick[];
  /** Aim recovery when not firing (higher = faster reset). */
  readonly recoverySpeed: number;
  /** How quickly the view eases toward accumulated recoil (higher = snappier). */
  readonly aimSmoothSpeed?: number;
  /** Scales pattern kicks while aiming down sights. */
  readonly adsMultiplier: number;
  /** Extra scale on horizontal kick (defaults to 1). */
  readonly yawScale?: number;
  /** Peak visual weapon kick on each shot (0–1). */
  readonly visualKick: number;
  /** How quickly the visual kick settles. */
  readonly visualRecoverySpeed: number;
  /** Visual kick scale while ADS (defaults to ~60% if omitted). */
  readonly adsVisualMultiplier?: number;
  /** Per-axis view-model kick multipliers (rifle defaults if omitted). */
  readonly visualStyle?: VisualRecoilStyle;
}

/** First-person weapon mesh offsets applied on top of `visualKick`. */
export interface VisualRecoilStyle {
  /** Pitch — negative tips muzzle toward the sky. */
  readonly rotX?: number;
  readonly rotYFromYaw?: number;
  readonly rotZ?: number;
  readonly posXFromYaw?: number;
  /** Positive raises the grip (legacy; prefer `kickUp`). */
  readonly posY?: number;
  /** Positive pulls the handle toward the camera (legacy; prefer `kickBack`). */
  readonly posZ?: number;
  /** Shoulder push — positive shoves the viewmodel toward the player (+Z). */
  readonly kickBack?: number;
  /** Vertical shove on the grip while kicking (positive raises). */
  readonly kickUp?: number;
}

export type WeaponFireMode = 'auto' | 'semi';

/** Brief muzzle burst — three additive plasma tones plus particle spray. */
export interface MuzzleFlashConfig {
  /** Radius of the brightest core sphere. */
  readonly coreScale: number;
  readonly duration: number;
  readonly particleCount: number;
  readonly particleSpeed: number;
  /** Lateral spread of plasma sparks (world units per second). */
  readonly particleSpread: number;
  /** Three hex colors — typically cyan / purple plasma tones. */
  readonly colors: readonly [number, number, number];
  readonly lightIntensity: number;
  readonly lightDistance: number;
  /** Sphere glow size multiplier on `coreScale` (default ~0.42). */
  readonly glowScale?: number;
  /** Additive sphere layers — 0 disables ball glow (particles only). */
  readonly glowLayers?: 0 | 1 | 2 | 3;
  /** Point sprite size multiplier on `coreScale` (default 1.8). */
  readonly particleSizeScale?: number;
}

export interface WeaponSwayConfig {
  /** Scales all sway axes for this weapon (default 1). */
  readonly intensity?: number;
}

/** Client-side audio paths (served from `public/`). */
export interface WeaponSoundClip {
  readonly src: string;
  /** Gain for this clip (defaults to `WeaponSoundsConfig.volume`, then 1). */
  readonly volume?: number;
}

export interface WeaponSoundsConfig {
  /** Semi-auto shots and the first shot of an auto burst. */
  readonly singleShot?: string | WeaponSoundClip;
  /** Sustained auto fire after the first shot while holding trigger. */
  readonly autoShot?: string | WeaponSoundClip;
  /** Default gain for clips that omit their own `volume` (default 1). */
  readonly volume?: number;
}

export type WeaponShotSoundVariant = 'single' | 'auto';

export interface WeaponConfig {
  readonly id: WeaponId;
  readonly name: string;
  readonly clipSize: number;
  readonly reloadSec: number;
  readonly reserveClips: number;
  /** Shots per second (semi-auto still respects one shot per trigger pull). */
  readonly fireRate: number;
  readonly fireMode: WeaponFireMode;
  readonly damage: number;
  /** World units per second for hitscan-style projectile travel. */
  readonly projectileSpeed: number;
  readonly view: WeaponViewConfig;
  readonly recoil: RecoilConfig;
  readonly muzzleFlash: MuzzleFlashConfig;
  /** Optional per-weapon sway intensity scale (defaults to 1). */
  readonly sway?: WeaponSwayConfig;
  /** Optional weapon fire SFX (client only). */
  readonly sounds?: WeaponSoundsConfig;
}
