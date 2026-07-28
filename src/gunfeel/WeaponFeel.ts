import type * as THREE from 'three';
import type { RecoilConfig } from '../../shared/content/weaponConfig';
import { KickbackSystem } from './KickbackSystem';
import { RecoilSystem } from './RecoilSystem';

/**
 * Per-weapon-slot feel bundle:
 * - RecoilSystem → pattern climb on the aim rigs (crosshair / recoil control)
 * - KickbackSystem → spring wrist-flick on the viewmodel mesh only
 *
 * These stay independent so visual kick amplitude never fights recoil management.
 *
 * Auto weapons bake pattern recoil into look on stop-fire. Semi / burst /
 * melee recover pattern recoil with Hooke's-law springs.
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

  /**
   * Camera: pattern recoil only on the aim rigs (crosshair / recoil control).
   * Visual weapon kick stays on the mesh via `applyWeaponVisual` — never mixed in.
   */
  applyAim(yawRig: THREE.Object3D, pitchRig: THREE.Object3D, basePitch: number): void {
    this.recoil.applyAim(yawRig, pitchRig, basePitch);
  }

  /**
   * Live camera aim offset for network spine pitch — pattern recoil only.
   * Kickback camera springs are intentionally unused so visual mesh kick can
   * be tuned independently of crosshair climb.
   */
  getCameraAimOffset(): { pitch: number; yaw: number } {
    return this.recoil.getOffset();
  }

  /** Viewmodel only: spring wrist-flick kick (does not move the crosshair). */
  applyWeaponVisual(weapon: THREE.Object3D, adsBlend = 0): void {
    this.kickback.applyWeaponVisual(weapon, adsBlend);
  }
}
