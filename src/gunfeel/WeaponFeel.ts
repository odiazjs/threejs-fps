import type * as THREE from 'three';
import type { RecoilConfig } from '../../shared/content/weaponConfig';
import { KickbackSystem } from './KickbackSystem';
import { RecoilSystem } from './RecoilSystem';

/**
 * Per-weapon-slot feel bundle: camera recoil + procedural kickback.
 *
 * Auto weapons bake pattern recoil into look on stop-fire. Semi / burst /
 * melee recover pattern recoil with Hooke's-law springs (same camera spring
 * as KickbackSystem).
 */
export class WeaponFeel {
  readonly recoil: RecoilSystem;
  readonly kickback: KickbackSystem;

  private readonly bakeScratch = { pitch: 0, yaw: 0 };

  constructor(recoilConfig: RecoilConfig, weaponId: string, bakeOnStop = false) {
    this.recoil = new RecoilSystem(recoilConfig, weaponId, bakeOnStop);
    this.kickback = new KickbackSystem(weaponId);
  }

  setConfig(config: RecoilConfig): void {
    this.recoil.setConfig(config);
  }

  /** Toggle bake-on-stop (true for `fireMode: 'auto'` weapons). */
  setBakeOnStop(bakeOnStop: boolean): void {
    this.recoil.setBakeOnStop(bakeOnStop);
  }

  reset(): void {
    this.recoil.reset();
    this.kickback.reset();
  }

  /** Per bullet — pattern step + spring impulses. */
  onShot(adsBlend: number): void {
    this.recoil.onShot(adsBlend);
    this.kickback.onShot(adsBlend);
  }

  /** Mouse angular speed (rad/s) this frame — enables recoil smoothing. */
  setLookVelocity(radPerSec: number): void {
    this.recoil.setLookVelocity(radPerSec);
  }

  update(delta: number, shooting: boolean, ads: boolean): void {
    this.recoil.update(delta, shooting, ads);
    this.kickback.update(delta);
  }

  /**
   * Apply any pending recoil bake into permanent look. Call after `update`
   * and before `applyAim` so the camera stays continuous.
   */
  consumeRecoilBake(out: { pitch: number; yaw: number }): boolean {
    return this.recoil.consumeBake(out);
  }

  /** Shared scratch for Player — avoids per-frame object allocation. */
  getRecoilBakeScratch(): { pitch: number; yaw: number } {
    return this.bakeScratch;
  }

  /** Camera: pattern offset on the recoil rigs (yaw parent / pitch child). */
  applyAim(yawRig: THREE.Object3D, pitchRig: THREE.Object3D, basePitch: number): void {
    this.recoil.applyAim(yawRig, pitchRig, basePitch);
    this.kickback.applyCameraAdditive(yawRig, pitchRig);
  }

  /**
   * Total live camera kick (pattern recoil + crack springs). Used by
   * getNetworkAim so remotes' spine tracks the same climb the shooter sees.
   */
  getCameraAimOffset(): { pitch: number; yaw: number } {
    const recoil = this.recoil.getOffset();
    const kick = this.kickback.getCameraOffset();
    return {
      pitch: recoil.pitch + kick.pitch,
      yaw: recoil.yaw + kick.yaw,
    };
  }

  /** Viewmodel: additive spring kick after the pose is set for the frame. */
  applyWeaponVisual(weapon: THREE.Object3D): void {
    this.kickback.applyWeaponVisual(weapon);
  }
}
