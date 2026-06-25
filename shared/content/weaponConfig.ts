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
  /** Positive raises the grip. */
  readonly posY?: number;
  /** Positive pulls the handle toward the camera. */
  readonly posZ?: number;
}

export type WeaponFireMode = 'auto' | 'semi';

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
  readonly view: WeaponViewConfig;
  readonly recoil: RecoilConfig;
}
