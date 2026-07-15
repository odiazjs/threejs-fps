import type * as THREE from 'three';
import type { RecoilConfig } from '../../shared/content/weaponConfig';
import { KickbackSystem } from './KickbackSystem';
import { RecoilSystem } from './RecoilSystem';

/**
 * Per-weapon-slot feel bundle: camera recoil (pattern + smoothing + curve
 * recovery) and procedural kickback (weapon + camera springs).
 *
 * One instance lives on each WeaponSlot — switching weapons switches feel
 * state with it, so a sniper's slow-settling springs never bleed into the
 * pistol.
 */
export class WeaponFeel {
  readonly recoil: RecoilSystem;
  readonly kickback: KickbackSystem;

  constructor(recoilConfig: RecoilConfig, weaponId: string) {
    this.recoil = new RecoilSystem(recoilConfig, weaponId);
    this.kickback = new KickbackSystem(weaponId);
  }

  setConfig(config: RecoilConfig): void {
    this.recoil.setConfig(config);
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

  /** Camera: pattern offset on the recoil rigs (yaw parent / pitch child). */
  applyAim(yawRig: THREE.Object3D, pitchRig: THREE.Object3D, basePitch: number): void {
    this.recoil.applyAim(yawRig, pitchRig, basePitch);
    this.kickback.applyCameraAdditive(yawRig, pitchRig);
  }

  /** Viewmodel: additive spring kick after the pose is set for the frame. */
  applyWeaponVisual(weapon: THREE.Object3D): void {
    this.kickback.applyWeaponVisual(weapon);
  }
}
