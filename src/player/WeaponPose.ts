import * as THREE from 'three';
import type { WeaponViewConfig } from '../../shared/content/weaponConfig';
import { KATANA_SLASH_DURATION_SEC } from '../effects/KatanaSlashTrailFx';

const HIP_FOV = 75;
const DEFAULT_ADS_FOV = 68;
const HIP_CAMERA_NEAR = 0.01;
const ADS_CAMERA_NEAR = 0.01;
/** Fallback ADS blend rate when a weapon has no adsTime (≈0.18s hip→ADS). */
const DEFAULT_ADS_BLEND_SPEED = 30;
const RELOAD_ADS_BLEND_SPEED = 55;
const MIN_ADS_TIME_SEC = 0.05;
const MAX_ADS_TIME_SEC = 1.5;
export const WEAPON_SWITCH_SEC = 0.2;

/** Convert seconds-to-full-ADS into an exponential blend speed matching legacy feel. */
export function adsBlendSpeedFromAdsTime(adsTimeSec: number): number {
  const t = THREE.MathUtils.clamp(adsTimeSec, MIN_ADS_TIME_SEC, MAX_ADS_TIME_SEC);
  // Legacy BLEND_SPEED 30 ≈ 0.18s; scale inversely with adsTime.
  return DEFAULT_ADS_BLEND_SPEED * (0.18 / t);
}

/** Default hip offset — used when attaching meshes before per-weapon pose runs. */
export const DEFAULT_HIP_OFFSET = new THREE.Vector3(0.15, -0.18, -0.35);
export { DEFAULT_HIP_OFFSET as WEAPON_HIP_OFFSET };

const _hip = new THREE.Vector3();
const _ads = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _weaponRot = new THREE.Euler();

interface PoseOffsets {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

function clamp01(t: number): number {
  return THREE.MathUtils.clamp(t, 0, 1);
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/** Horizontal slash — katana sweeps right to left across the view. */
function sampleSlashOffsets(progress: number): PoseOffsets {
  const t = clamp01(progress);
  const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const arc = Math.sin(t * Math.PI);

  return {
    x: THREE.MathUtils.lerp(0.48, -0.62, ease),
    y: -0.05 + arc * 0.12,
    z: THREE.MathUtils.lerp(-0.02, -0.14, ease),
    rx: THREE.MathUtils.lerp(-0.35, 0.42, ease) + arc * 0.18,
    ry: THREE.MathUtils.lerp(2.45, -3.05, ease),
    rz: THREE.MathUtils.lerp(-0.55, 0.72, ease),
  };
}

/** Quick draw-from-hip when equipping a new weapon. */
function sampleSwitchOffsets(progress: number): PoseOffsets {
  const t = easeOutCubic(clamp01(progress));
  const inv = 1 - t;

  return {
    x: 0.07 * inv,
    y: -0.2 * inv,
    z: 0.11 * inv,
    rx: 0.32 * inv,
    ry: -0.14 * inv,
    rz: 0.12 * inv,
  };
}

/** Drop into the hidden pose over this fraction of reload. */
const PISTOL_RELOAD_DIP_IN = 0.12;
/** Stay fully down until this progress, then snap back up for the remainder. */
const PISTOL_RELOAD_DIP_HOLD_UNTIL = 0.82;

/**
 * Procedural pistol reload — drop fast, stay hidden most of the reload,
 * then snappy ease-out return near the end.
 */
function sampleReloadDipOffsets(progress: number): PoseOffsets {
  const t = clamp01(progress);
  let dip: number;
  if (t <= PISTOL_RELOAD_DIP_IN) {
    // Snappy drop (ease-out into the low pose).
    dip = easeOutCubic(t / PISTOL_RELOAD_DIP_IN);
  } else if (t < PISTOL_RELOAD_DIP_HOLD_UNTIL) {
    dip = 1;
  } else {
    // Fast snappy return over the final stretch.
    const u = (t - PISTOL_RELOAD_DIP_HOLD_UNTIL) / (1 - PISTOL_RELOAD_DIP_HOLD_UNTIL);
    dip = 1 - easeOutCubic(u);
  }

  return {
    x: 0.02 * dip,
    y: -0.24 * dip,
    z: 0.08 * dip,
    rx: 0.42 * dip,
    ry: -0.06 * dip,
    rz: 0.1 * dip,
  };
}

function applyPoseOffsets(target: THREE.Vector3, base: THREE.Vector3, offsets: PoseOffsets): void {
  target.set(
    base.x + offsets.x,
    base.y + offsets.y,
    base.z + offsets.z,
  );
}

function applyPoseRotation(target: THREE.Euler, base: THREE.Euler, offsets: PoseOffsets): void {
  target.set(
    base.x + offsets.rx,
    base.y + offsets.ry,
    base.z + offsets.rz,
    base.order,
  );
}

function copyViewOffset(target: THREE.Vector3, offset: { x: number; y: number; z: number }): void {
  target.set(offset.x, offset.y, offset.z);
}

/** Blends the local weapon between hip-fire and ADS. */
export class WeaponPose {
  private blend = 0;
  private reloading = false;
  private reloadProgress = 0;
  /** When true, reload dips the weapon in code instead of FP arms anim. */
  private proceduralReload = false;
  private switchDuration = WEAPON_SWITCH_SEC;
  private switchTimeLeft = 0;
  private slashDuration = KATANA_SLASH_DURATION_SEC;
  private slashTimeLeft = 0;
  private adsFov = DEFAULT_ADS_FOV;
  private adsBlendSpeed = DEFAULT_ADS_BLEND_SPEED;
  /** When true, main camera keeps hip FOV; zoom is handled by ScopeLens. */
  private scopeLensAds = false;
  private view: WeaponViewConfig | null = null;

  get hipOffset(): THREE.Vector3 {
    copyViewOffset(_hip, this.view?.hip ?? DEFAULT_HIP_OFFSET);
    return _hip;
  }

  get adsBlend(): number {
    return this.blend;
  }

  get isReloading(): boolean {
    return this.reloading;
  }

  isSwitching(): boolean {
    return this.switchTimeLeft > 0;
  }

  isSlashing(): boolean {
    return this.slashTimeLeft > 0;
  }

  getSwitchProgress(): number {
    if (this.switchDuration <= 0 || this.switchTimeLeft <= 0) return 1;
    return 1 - this.switchTimeLeft / this.switchDuration;
  }

  getSlashProgress(): number {
    if (this.slashDuration <= 0 || this.slashTimeLeft <= 0) return 1;
    return 1 - this.slashTimeLeft / this.slashDuration;
  }

  startSlash(duration = KATANA_SLASH_DURATION_SEC): void {
    this.slashDuration = duration;
    this.slashTimeLeft = duration;
  }

  startSwitch(duration = WEAPON_SWITCH_SEC): void {
    this.switchDuration = duration;
    this.switchTimeLeft = duration;
  }

  /** Drop an in-progress holster/draw so a quick melee slash can start immediately. */
  cancelSwitch(): void {
    this.switchTimeLeft = 0;
  }

  setViewConfig(view: WeaponViewConfig, adsTimeSec?: number): void {
    this.view = view;
    this.adsFov = view.adsFov ?? DEFAULT_ADS_FOV;
    this.scopeLensAds = view.scopeLensAds === true;
    if (adsTimeSec !== undefined && Number.isFinite(adsTimeSec) && adsTimeSec > 0) {
      this.adsBlendSpeed = adsBlendSpeedFromAdsTime(adsTimeSec);
    }
  }

  setAdsTime(adsTimeSec: number): void {
    if (!Number.isFinite(adsTimeSec) || adsTimeSec <= 0) return;
    this.adsBlendSpeed = adsBlendSpeedFromAdsTime(adsTimeSec);
  }

  reset(): void {
    this.blend = 0;
    this.reloading = false;
    this.reloadProgress = 0;
    this.proceduralReload = false;
    this.switchTimeLeft = 0;
    this.slashTimeLeft = 0;
  }

  update(
    delta: number,
    ads: boolean,
    reloading: boolean,
    reloadProgress: number,
    options?: { ignoreAds?: boolean; forceHip?: boolean; proceduralReload?: boolean },
  ): void {
    const wasReloading = this.reloading;
    this.reloading = reloading;
    this.proceduralReload = options?.proceduralReload ?? false;
    this.reloadProgress = reloading
      ? THREE.MathUtils.clamp(
          Number.isFinite(reloadProgress) ? reloadProgress : 0,
          0,
          1,
        )
      : 0;

    if (this.switchTimeLeft > 0) {
      this.switchTimeLeft = Math.max(0, this.switchTimeLeft - delta);
    }

    if (this.slashTimeLeft > 0) {
      this.slashTimeLeft = Math.max(0, this.slashTimeLeft - delta);
    }

    const forceHip = (options?.forceHip ?? false) || reloading;

    // Reload / sprint owns the viewmodel — clear slash leftover and snap out of ADS.
    if (forceHip) {
      this.slashTimeLeft = 0;
      if (reloading && !wasReloading) {
        this.blend = 0;
      }
    }

    const canAim = !forceHip && !this.isSwitching() && !this.isSlashing();
    const ignoreAds = options?.ignoreAds ?? false;
    const targetAds = !ignoreAds && ads && canAim ? 1 : 0;
    const blendSpeed =
      forceHip || this.isSwitching() ? RELOAD_ADS_BLEND_SPEED : this.adsBlendSpeed;
    this.blend += (targetAds - this.blend) * (1 - Math.exp(-blendSpeed * delta));
    if (forceHip) {
      this.blend = 0;
    }
  }

  private getActivePoseOffsets(): PoseOffsets | null {
    if (this.slashTimeLeft > 0) {
      return sampleSlashOffsets(this.getSlashProgress());
    }
    if (this.isSwitching()) {
      return sampleSwitchOffsets(this.getSwitchProgress());
    }
    if (this.reloading && this.proceduralReload) {
      return sampleReloadDipOffsets(this.reloadProgress);
    }
    return null;
  }

  apply(weapon: THREE.Object3D, wallPullback = 0, baseRotation?: THREE.Euler): void {
    if (!this.view) return;

    copyViewOffset(_hip, this.view.hip);
    copyViewOffset(_ads, this.view.ads);
    _offset.lerpVectors(_hip, _ads, this.blend);

    const pose = this.getActivePoseOffsets();
    if (pose) {
      applyPoseOffsets(_offset, _offset, pose);
    }

    if (wallPullback > 0) {
      _offset.z += wallPullback;
    }

    weapon.position.copy(_offset);

    if (baseRotation) {
      _weaponRot.copy(baseRotation);
      if (pose) {
        applyPoseRotation(_weaponRot, _weaponRot, pose);
      }
      weapon.rotation.copy(_weaponRot);
    }
  }

  applyRemoteReload(
    weapon: THREE.Object3D,
    basePosition: THREE.Vector3,
    baseRotation: THREE.Euler,
  ): void {
    const pose = this.getActivePoseOffsets();

    if (pose) {
      applyPoseOffsets(weapon.position, basePosition, pose);
      applyPoseRotation(_weaponRot, baseRotation, pose);
    } else {
      weapon.position.copy(basePosition);
      _weaponRot.copy(baseRotation);
    }

    weapon.rotation.copy(_weaponRot);
  }

  getWeaponRotation(base: THREE.Euler): THREE.Euler {
    _weaponRot.copy(base);

    const pose = this.getActivePoseOffsets();
    if (pose) {
      applyPoseRotation(_weaponRot, _weaponRot, pose);
    }

    return _weaponRot;
  }

  applyCamera(camera: THREE.PerspectiveCamera): void {
    // Scope-lens weapons keep a wide main view; zoom is drawn on the optic glass.
    const targetFov = this.scopeLensAds ? HIP_FOV : this.adsFov;
    camera.fov = THREE.MathUtils.lerp(HIP_FOV, targetFov, this.blend);
    camera.near = THREE.MathUtils.lerp(HIP_CAMERA_NEAR, ADS_CAMERA_NEAR, this.blend);
    camera.updateProjectionMatrix();
  }

  /** ADS FOV used by the scope-lens camera (or main camera when not scope-lens). */
  getAdsFov(): number {
    return this.adsFov;
  }

  usesScopeLensAds(): boolean {
    return this.scopeLensAds;
  }
}
