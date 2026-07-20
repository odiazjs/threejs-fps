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
  /** Mouse look speed multiplier when fully ADS (1 = unchanged). */
  readonly adsLookSensitivity?: number;
  /** Extra euler (radians) added on first-person attach rotation. */
  readonly localMeshEuler?: WeaponViewOffset;
  /** Extra euler (radians) added on third-person attach rotation. */
  readonly remoteMeshEuler?: WeaponViewOffset;
  /** Local offset from the right-hand bone for third-person weapon attach. */
  readonly remoteHand?: WeaponViewOffset;
}

export interface RecoilKick {
  /** Radians added to pitch per shot (positive kicks the view upward on the aim rig). */
  readonly pitch: number;
  /** Radians added to yaw per shot. */
  readonly yaw: number;
}

export interface RecoilConfig {
  /** Per-shot kicks; index wraps for sustained fire. */
  readonly pattern: readonly RecoilKick[];
  /** Aim recovery when not firing (higher = faster reset). */
  readonly recoverySpeed: number;
  /**
   * Hold accumulated kick this long after the last shot before recovery starts.
   * Critical for semi-auto (fire flag is only true for one frame).
   */
  readonly recoveryDelaySec?: number;
  /** How quickly the view eases toward accumulated recoil (higher = snappier). */
  readonly aimSmoothSpeed?: number;
  /** Scales pattern kicks while aiming down sights. */
  readonly adsMultiplier: number;
  /** Extra scale on horizontal kick (defaults to 1). */
  readonly yawScale?: number;
  /**
   * Multiplier on pattern pitch/yaw for camera aim kick.
   * Set from Armory recoil via `withEffectiveWeaponStats` (recoilStat / 50).
   */
  readonly cameraKickScale?: number;
  /** Peak visual weapon kick on each shot (0–1+). */
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

export type WeaponFireMode = 'auto' | 'semi' | 'burst' | 'melee';

/** Brief muzzle burst — particle spray (+ optional streaks). No sphere by default. */
export interface MuzzleFlashConfig {
  /** Base size for particles / light (and legacy sphere glow if enabled). */
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
  /** Sphere glow size multiplier on `coreScale` (default ~0.42). Unused when glowLayers is 0. */
  readonly glowScale?: number;
  /** Additive sphere layers — 0/omitted = particles only (default). */
  readonly glowLayers?: 0 | 1 | 2 | 3;
  /** Point sprite size multiplier on `coreScale` (default 1.8). */
  readonly particleSizeScale?: number;
  /**
   * Extra downward acceleration on muzzle sparks (local +Y is up in flash space).
   * Higher values make ejecta feel heavier / more liquid.
   */
  readonly particleFall?: number;
  /**
   * Bright elongated streaks fanned on a cone — one per pellet, so
   * multi-barrel weapons visibly blast N projectiles at once. 0/omitted = off.
   */
  readonly streakCount?: number;
  /** Cone half-angle (radians) for streaks — match `pelletSpreadRad`. */
  readonly streakSpreadRad?: number;
  /** Lateral sparks from barrel side vents — subtle on pistols, loud on shotguns. */
  readonly sideVents?: SideVentFlashConfig;
}

/** Per-weapon side-port muzzle sparks (Apex-style lateral gas bleed). */
export interface SideVentFlashConfig {
  /** Particles emitted from each side vent per shot. */
  readonly particleCount: number;
  /** Outward speed of lateral sparks (world units / s). */
  readonly particleSpeed: number;
  /** 0 = forward, 1 = purely lateral along ±X in flash space. */
  readonly lateralBias: number;
  /** Sprite size multiplier on main flash `coreScale` (default ~0.5). */
  readonly particleSizeScale?: number;
  /** Multiplier on main flash duration (default 1). */
  readonly durationScale?: number;
  /** Bright horizontal wisps per vent — 0 = particles only. */
  readonly streakCount?: number;
  /** Optional palette override; defaults to main flash colors. */
  readonly colors?: readonly [number, number, number];
}

export interface WeaponSwayConfig {
  /**
   * Scales viewmodel + camera idle/walk sway for this weapon (default 1).
   * Higher = more breathing / bob (e.g. sniper); lower = steadier (e.g. carbine).
   */
  readonly intensity?: number;
}

/** Client-side audio paths (served from `public/`). */
export interface WeaponSoundClip {
  readonly src: string;
  /** Gain for this clip (defaults to `WeaponSoundsConfig.volume`, then 1). */
  readonly volume?: number;
  /** Wet reverb mix for this clip (0 = dry, 1 = full wet). */
  readonly reverbLevel?: number;
}

export interface WeaponSoundsConfig {
  /** Semi-auto shots and the first shot of an auto burst. */
  readonly singleShot?: string | WeaponSoundClip;
  /** Sustained auto fire after the first shot while holding trigger. */
  readonly autoShot?: string | WeaponSoundClip;
  /**
   * One-shot played when a magazine reload starts.
   * Prefer `{ src, volume }` so reload loudness is independent of fire SFX.
   */
  readonly reload?: string | WeaponSoundClip;
  /** Per-shell insert SFX for `reloadStyle: 'shell'` weapons. */
  readonly reloadPartial?: string | WeaponSoundClip;
  /** Played when a shell reload fills the magazine completely. */
  readonly reloadComplete?: string | WeaponSoundClip;
  /** Default gain for clips that omit their own `volume` (default 1). */
  readonly volume?: number;
  /** Fallback wet reverb when a clip omits its own `reverbLevel`. */
  readonly reverbLevel?: number;
}

export type WeaponShotSoundVariant = 'single' | 'auto';

export type WeaponShotSoundPhase = 'single' | 'autoStart' | 'autoStop';

export interface WeaponConfig {
  readonly id: WeaponId;
  readonly name: string;
  readonly clipSize: number;
  readonly reloadSec: number;
  /**
   * `magazine` (default) — one timed reload fills the clip.
   * `shell` — loads one round at a time; `reloadSec` is the full-mag duration
   * (per-shell time = reloadSec / clipSize). Can interrupt to fire mid-reload.
   */
  readonly reloadStyle?: 'magazine' | 'shell';
  readonly reserveClips: number;
  /** Shots per second. Use 0 for uncapped (semi: as fast as the player can click). */
  readonly fireRate: number;
  readonly fireMode: WeaponFireMode;
  /** Shots fired per trigger pull when `fireMode` is `burst` (default 3). */
  readonly burstCount?: number;
  /**
   * Extra cooldown (seconds) after a burst finishes before the next burst can start.
   * Intra-burst spacing still uses `1 / fireRate`.
   */
  readonly burstRecoverySec?: number;
  /**
   * Simultaneous projectiles per trigger pull (shotgun). Defaults to 1.
   * Armory `damage` is applied per pellet that hits.
   */
  readonly pelletCount?: number;
  /**
   * Cone half-angle in radians for non-center pellets when `pelletCount` > 1.
   * Pellet 0 stays on the aim ray; others sit on a ring at this angle.
   */
  readonly pelletSpreadRad?: number;
  /**
   * Multiplier on `pelletSpreadRad` while fully ADS (default 0.55).
   * Hip fire uses 1.0.
   */
  readonly pelletAdsSpreadScale?: number;
  readonly damage: number;
  /** Seconds to reach full ADS (hip → sights). Lower is faster. */
  readonly adsTime: number;
  /** World units per second for hitscan-style projectile travel. */
  readonly projectileSpeed: number;
  /**
   * Visual projectile look. `bioLiquid` = glowing viscous blobs with trail.
   * Defaults to a standard plasma bolt.
   */
  readonly projectileStyle?: 'bolt' | 'bioLiquid';
  /**
   * Downward acceleration (world units / s²) applied to the tracer pose for weight/arc.
   * Hit resolution stays on the aim ray; only the flying visual sags.
   */
  readonly projectileGravity?: number;
  readonly view: WeaponViewConfig;
  readonly recoil: RecoilConfig;
  readonly muzzleFlash: MuzzleFlashConfig;
  /** Optional per-weapon sway intensity scale (defaults to 1). */
  readonly sway?: WeaponSwayConfig;
  /** Optional weapon fire SFX (client only). */
  readonly sounds?: WeaponSoundsConfig;
  /** Locomotion speed multiplier while this weapon is active (melee). */
  readonly moveSpeedMultiplier?: number;
  /** Melee hit range in world units. */
  readonly meleeRange?: number;
  /**
   * Max player-hit distance for this weapon (Armory range).
   * Guns use this for projectile path; melee also mirrors it via meleeRange.
   */
  readonly maxHitDistance?: number;
}
