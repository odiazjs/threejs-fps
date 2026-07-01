import * as THREE from 'three';
import type { WeaponViewConfig } from '../../shared/content/weaponConfig';
import { KATANA_SLASH_DURATION_SEC } from '../effects/KatanaSlashTrailFx';

const HIP_FOV = 75;
const DEFAULT_ADS_FOV = 68;
const HIP_CAMERA_NEAR = 0.1;
const ADS_CAMERA_NEAR = 0.01;
const BLEND_SPEED = 30;
const RELOAD_ADS_BLEND_SPEED = 55;
export const WEAPON_SWITCH_SEC = 0.2;

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

function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.6;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function sampleReloadOffsets(progress: number): PoseOffsets {
  const t = clamp01(progress);

  let drop = 0;
  if (t < 0.2) {
    drop = easeOutCubic(t / 0.2);
  } else if (t < 0.5) {
    drop = 1;
  } else {
    drop = 1 - easeOutBack((t - 0.5) / 0.5);
  }

  const insertPhase = t >= 0.2 && t < 0.5;
  const insertT = insertPhase ? (t - 0.2) / 0.3 : 0;
  const click = insertPhase ? Math.abs(Math.sin(insertT * Math.PI * 3)) * 0.22 : 0;

  const rack = t >= 0.5 ? easeOutBack((t - 0.5) / 0.5) : 0;
  const rackSnap = Math.sin(rack * Math.PI) * 0.14;

  return {
    x: -0.12 * drop + click * 0.035,
    y: -0.16 * drop - rackSnap * 0.05,
    z: 0.1 * drop + rackSnap * 0.07,
    rx: 0.48 * drop + rackSnap * 0.1,
    ry: 0.32 * drop + click * 0.08,
    rz: 0.26 * drop + click * 0.06,
  };
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

/** Blends the local weapon between hip-fire, ADS, and reload poses. */
export class WeaponPose {
  private blend = 0;
  private reloadProgress = 0;
  private switchDuration = WEAPON_SWITCH_SEC;
  private switchTimeLeft = 0;
  private slashDuration = KATANA_SLASH_DURATION_SEC;
  private slashTimeLeft = 0;
  private adsFov = DEFAULT_ADS_FOV;
  private view: WeaponViewConfig | null = null;

  get hipOffset(): THREE.Vector3 {
    copyViewOffset(_hip, this.view?.hip ?? DEFAULT_HIP_OFFSET);
    return _hip;
  }

  get adsBlend(): number {
    return this.blend;
  }

  get isReloading(): boolean {
    return this.reloadProgress > 0;
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

  setViewConfig(view: WeaponViewConfig): void {
    this.view = view;
    this.adsFov = view.adsFov ?? DEFAULT_ADS_FOV;
  }

  reset(): void {
    this.blend = 0;
    this.reloadProgress = 0;
    this.switchTimeLeft = 0;
    this.slashTimeLeft = 0;
  }

  update(
    delta: number,
    ads: boolean,
    reloading: boolean,
    reloadProgress: number,
    options?: { ignoreAds?: boolean },
  ): void {
    this.reloadProgress = reloading ? reloadProgress : 0;

    if (this.switchTimeLeft > 0) {
      this.switchTimeLeft = Math.max(0, this.switchTimeLeft - delta);
    }

    if (this.slashTimeLeft > 0) {
      this.slashTimeLeft = Math.max(0, this.slashTimeLeft - delta);
    }

    const canAim = !reloading && !this.isSwitching() && !this.isSlashing();
    const ignoreAds = options?.ignoreAds ?? false;
    const targetAds = !ignoreAds && ads && canAim ? 1 : 0;
    const blendSpeed = reloading || this.isSwitching() ? RELOAD_ADS_BLEND_SPEED : BLEND_SPEED;
    this.blend += (targetAds - this.blend) * (1 - Math.exp(-blendSpeed * delta));
  }

  private getActivePoseOffsets(): PoseOffsets | null {
    if (this.slashTimeLeft > 0) {
      return sampleSlashOffsets(this.getSlashProgress());
    }
    if (this.reloadProgress > 0) {
      return sampleReloadOffsets(this.reloadProgress);
    }
    if (this.isSwitching()) {
      return sampleSwitchOffsets(this.getSwitchProgress());
    }
    return null;
  }

  apply(weapon: THREE.Object3D): void {
    if (!this.view) return;

    copyViewOffset(_hip, this.view.hip);
    copyViewOffset(_ads, this.view.ads);
    _offset.lerpVectors(_hip, _ads, this.blend);

    const pose = this.getActivePoseOffsets();
    if (pose) {
      applyPoseOffsets(_offset, _offset, pose);
    }

    weapon.position.copy(_offset);
  }

  applyRemoteReload(
    weapon: THREE.Object3D,
    basePosition: THREE.Vector3,
    baseRotation: THREE.Euler,
  ): void {
    const pose = this.isSlashing()
      ? sampleSlashOffsets(this.getSlashProgress())
      : this.isSwitching()
        ? sampleSwitchOffsets(this.getSwitchProgress())
        : null;

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
    camera.fov = THREE.MathUtils.lerp(HIP_FOV, this.adsFov, this.blend);
    camera.near = THREE.MathUtils.lerp(HIP_CAMERA_NEAR, ADS_CAMERA_NEAR, this.blend);
    camera.updateProjectionMatrix();
  }
}
