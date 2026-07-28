import * as THREE from 'three';
import { SpringDamper1D } from './gunFeelMath';
import { getWeaponFeelProfile, type KickbackFeel } from './feelProfiles';

/**
 * Procedural VIEWMODEL kickback — separate from camera/crosshair recoil
 * (RecoilSystem). Tuning springs here never moves the aim point.
 *
 * Graph-driven wrist-flick:
 * - Pitch and back-travel use SEPARATE springs so pitch peaks BEFORE shove.
 * - Weapon origin follows an ARC around a wrist/hand pivot — not a linear Z slide.
 * - Muzzle tips up; stock/backside dips down (seesaw around the grip).
 *
 * TRANSFORM HOOKUP: `applyWeaponVisual` after WeaponPose only.
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
    const lead = THREE.MathUtils.clamp(this.feel.pitchLead, 0, 1);

    // Pitch leads translation: stiffer pitch spring rises/peaks first (graph rule).
    const pitchStiffness = w.stiffness * (1 + lead * 0.85);
    const backStiffness = w.stiffness * (1 - lead * 0.28);
    // Pitch slightly underdamped for the small recovery "springiness" bump;
    // back a touch more damped so it peaks later and settles cleaner.
    const pitchDamp = Math.max(0.55, w.dampingRatio * (1 - lead * 0.18));
    const backDamp = Math.min(1.15, w.dampingRatio * (1 + lead * 0.08));

    this.back = new SpringDamper1D(backStiffness, backDamp);
    this.up = new SpringDamper1D(backStiffness * 1.05, backDamp);
    this.pitch = new SpringDamper1D(pitchStiffness, pitchDamp);
    this.yaw = new SpringDamper1D(w.stiffness, w.dampingRatio);
    this.roll = new SpringDamper1D(w.stiffness * 0.9, w.dampingRatio);
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
    const ads = THREE.MathUtils.clamp(adsBlend, 0, 1);

    // Hipfire: readable wrist flick. ADS: keep tip, soften shove into optic.
    const hip = 1 - ads;
    const backScale = THREE.MathUtils.lerp(1.15, 0.55, ads);
    const pitchScale = THREE.MathUtils.lerp(0.92, 1.05, ads) * (1 - hip * 0.08);

    this.back.impulse(this.feel.kickBack * scale * backScale);
    this.up.impulse(this.feel.kickUp * scale * (0.75 + Math.random() * 0.5));
    this.pitch.impulse(this.feel.kickPitch * scale * pitchScale);
    this.yaw.impulse(this.feel.kickYawJitter * scale * rand() * 0.85);
    this.roll.impulse(this.feel.kickRoll * scale * rand() * (0.55 + 0.45 * hip));
    // Camera crack springs intentionally unused — crosshair is RecoilSystem only.
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
   * Additive viewmodel kick after pose.
   *
   * Wrist-flick path: rotate around a pivot slightly toward the muzzle so the
   * stock dips down while the muzzle arcs up — not a straight +Z shove.
   */
  applyWeaponVisual(weapon: THREE.Object3D, adsBlend = 0): void {
    const back = Math.min(this.feel.maxBack, Math.max(0, this.back.value));
    const pitch = THREE.MathUtils.clamp(this.pitch.value, -this.feel.maxPitch, this.feel.maxPitch);
    const curve = THREE.MathUtils.clamp(this.feel.curveAmount, 0, 1);
    const ads = THREE.MathUtils.clamp(adsBlend, 0, 1);

    const { orbitY, orbitZ } = wristFlickOrbit(
      pitch,
      this.feel.pivotY,
      this.feel.pivotZ,
    );

    // Residual linear back (graph blue channel) blended into the orbital arc.
    const linearZ = back * (1 - curve * 0.78);
    const linearY = this.up.value * (1 - curve * 0.5);
    // Arc: origin rides the wrist pivot — stock dips (orbitY often negative).
    const curvedZ = orbitZ * curve + back * curve * 0.35;
    const curvedY = orbitY * curve + this.up.value * curve * 0.25;

    // ADS: keep the flick readable, never tunnel the optic through the camera.
    const transScale = THREE.MathUtils.lerp(1, 0.22, ads);
    const pitchScale = THREE.MathUtils.lerp(1, 0.62, ads);
    const yawRollScale = THREE.MathUtils.lerp(1, 0.55, ads);

    let dz = (linearZ + curvedZ) * transScale;
    let dy = (linearY + curvedY) * transScale;
    const minClearanceZ = -0.055;
    if (weapon.position.z + dz > minClearanceZ) {
      dz = Math.min(dz, minClearanceZ - weapon.position.z);
    }

    weapon.position.z += dz;
    weapon.position.y += dy;
    // Viewmodel +X tips muzzle toward sky; stock behind the wrist pivot dips.
    weapon.rotation.x += pitch * pitchScale;
    weapon.rotation.y += this.yaw.value * yawRollScale;
    weapon.rotation.z += this.roll.value * yawRollScale;
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

/**
 * Displacement of the weapon origin when rotating by `pitch` around a local
 * wrist pivot. Pivot sits slightly toward the muzzle (−Z) and below the grip
 * so positive pitch arcs the muzzle UP and dips the stock/backside DOWN.
 */
function wristFlickOrbit(
  pitch: number,
  pivotY: number,
  pivotZ: number,
): { orbitY: number; orbitZ: number } {
  if (Math.abs(pitch) < 1e-8) return { orbitY: 0, orbitZ: 0 };

  // Vector from pivot → weapon origin.
  const oy = -pivotY;
  const oz = -pivotZ;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  // Rotate around +X: (y, z) → (y c − z s, y s + z c)
  const ry = oy * c - oz * s;
  const rz = oy * s + oz * c;
  return {
    orbitY: ry - oy,
    orbitZ: rz - oz,
  };
}
