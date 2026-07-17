import * as THREE from 'three';
import { SpringDamper1D } from './gunFeelMath';
import { getWeaponFeelProfile, type KickbackFeel } from './feelProfiles';

/**
 * Procedural kickback, fully separated from camera recoil (RecoilSystem):
 *
 * - WEAPON KICK: each shot injects velocity impulses into spring-dampers for
 *   back-travel (+Z in view space — toward the player), vertical shove, and
 *   muzzle-up pitch with side jitter/roll. Hipfire boosts kick-back and
 *   damps muzzle tip so guns shove into the shoulder instead of flipping
 *   skyward. Hooke's law brings the model back; damping ratio = snap vs wobble.
 * - CAMERA KICK: a second, stiffer spring pair drives a sharp rotational
 *   view impulse that settles quickly — the "crack" on top of pattern recoil.
 *
 * TRANSFORM HOOKUP: `applyWeaponVisual` writes additively onto the weapon
 * mesh AFTER WeaponPose.apply has set the hip/ADS pose for the frame, and
 * `applyCameraAdditive` adds onto the yaw/pitch recoil rigs AFTER
 * RecoilSystem.applyAim (see Player.applyActiveRecoilAim).
 */
export class KickbackSystem {
  private readonly back: SpringDamper1D;
  private readonly up: SpringDamper1D;
  private readonly pitch: SpringDamper1D;
  private readonly yaw: SpringDamper1D;
  private readonly roll: SpringDamper1D;

  private readonly cameraPitch: SpringDamper1D;
  private readonly cameraYaw: SpringDamper1D;

  private readonly feel: KickbackFeel;

  constructor(weaponId: string) {
    this.feel = getWeaponFeelProfile(weaponId).kickback;
    const w = this.feel.weaponSpring;
    const c = this.feel.cameraSpring;

    this.back = new SpringDamper1D(w.stiffness, w.dampingRatio);
    this.up = new SpringDamper1D(w.stiffness, w.dampingRatio);
    this.pitch = new SpringDamper1D(w.stiffness, w.dampingRatio);
    this.yaw = new SpringDamper1D(w.stiffness, w.dampingRatio);
    this.roll = new SpringDamper1D(w.stiffness, w.dampingRatio);
    this.cameraPitch = new SpringDamper1D(c.stiffness, c.dampingRatio);
    this.cameraYaw = new SpringDamper1D(c.stiffness, c.dampingRatio);
  }

  reset(): void {
    this.back.reset();
    this.up.reset();
    this.pitch.reset();
    this.yaw.reset();
    this.roll.reset();
    this.cameraPitch.reset();
    this.cameraYaw.reset();
  }

  /** Fire one kick. Micro-kicks stack naturally — springs sum velocity. */
  onShot(adsBlend: number): void {
    const scale = THREE.MathUtils.lerp(1, this.feel.adsScale, adsBlend);
    const rand = () => Math.random() * 2 - 1;

    // Hipfire: shove the gun into the shoulder more than tip the muzzle skyward.
    // ADS keeps the authored pitch/back balance (adsBlend → 1).
    const hip = 1 - THREE.MathUtils.clamp(adsBlend, 0, 1);
    const backScale = 1 + hip * 0.45;
    const pitchScale = 1 - hip * 0.55;

    this.back.impulse(this.feel.kickBack * scale * backScale);
    this.up.impulse(this.feel.kickUp * scale * (0.8 + Math.random() * 0.4));
    this.pitch.impulse(this.feel.kickPitch * scale * pitchScale);
    this.yaw.impulse(this.feel.kickYawJitter * scale * rand() * pitchScale);
    this.roll.impulse(this.feel.kickRoll * scale * rand() * (0.7 + 0.3 * (1 - hip)));

    this.cameraPitch.impulse(this.feel.cameraPitch * scale);
    this.cameraYaw.impulse(this.feel.cameraYawJitter * scale * rand());
  }

  update(delta: number): void {
    this.back.update(delta);
    this.up.update(delta);
    this.pitch.update(delta);
    this.yaw.update(delta);
    this.roll.update(delta);
    this.cameraPitch.update(delta);
    this.cameraYaw.update(delta);
  }

  isActive(): boolean {
    return (
      Math.abs(this.back.value) > 1e-5 ||
      Math.abs(this.pitch.value) > 1e-5 ||
      Math.abs(this.cameraPitch.value) > 1e-5
    );
  }

  /**
   * Additive viewmodel kick. Call after WeaponPose/base pose is applied —
   * kick displaces the weapon from wherever it currently rests.
   * View space: -Z is downrange, so back-travel adds +Z (toward the camera).
   */
  applyWeaponVisual(weapon: THREE.Object3D): void {
    const back = Math.min(this.feel.maxBack, Math.max(0, this.back.value));
    const pitch = THREE.MathUtils.clamp(this.pitch.value, -this.feel.maxPitch, this.feel.maxPitch);

    weapon.position.z += back;
    weapon.position.y += this.up.value;
    // Matches the shipped viewmodel orientation (base yaw -PI/2 + mesh euler
    // PI): positive X tips the muzzle toward the sky on these meshes.
    weapon.rotation.x += pitch;
    weapon.rotation.y += this.yaw.value;
    weapon.rotation.z += this.roll.value;
  }

  /** Additive sharp view kick on the recoil rigs (after RecoilSystem.applyAim). */
  applyCameraAdditive(yawRig: THREE.Object3D, pitchRig: THREE.Object3D): void {
    pitchRig.rotation.x += this.cameraPitch.value;
    yawRig.rotation.y += this.cameraYaw.value;
  }

  /** Live camera crack offset — mirrored into network aim for remote spine pitch. */
  getCameraOffset(): { pitch: number; yaw: number } {
    return { pitch: this.cameraPitch.value, yaw: this.cameraYaw.value };
  }
}
