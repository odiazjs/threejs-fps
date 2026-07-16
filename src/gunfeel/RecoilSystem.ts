import * as THREE from 'three';
import type { RecoilConfig } from '../../shared/content/weaponConfig';
import { AIM_PITCH_LIMIT, AIM_ROTATION_ORDER } from '../player/playerAim';
import { expBlend, SpringDamper1D } from './gunFeelMath';
import { getWeaponFeelProfile, type RecoilFeel } from './feelProfiles';

/**
 * Camera recoil: deterministic spray pattern + Apex-style recoil smoothing.
 *
 * Stop behavior depends on fire mode (`bakeOnStop`):
 * - **Auto**: after `recoveryDelaySec`, bake the offset into permanent look so
 *   the view stays at the last kicked aim (no downward yank).
 * - **Semi / burst / melee**: after the delay, Hooke's-law springs pull the
 *   offset back to the look origin (same spring model as KickbackSystem).
 *
 * INPUT HOOKUP: call `setLookVelocity` once per frame, `onShot` per bullet,
 * `update` per frame, then `consumeBake` into PointerAimControls (auto only),
 * then `applyAim` after mouse look (see Player.applyActiveRecoilAim).
 */
export class RecoilSystem {
  /** Accumulated pattern offset the view is being pushed toward. */
  private targetPitch = 0;
  private targetYaw = 0;
  /** Smoothed view offset — eases toward the target while firing. */
  private currentPitch = 0;
  private currentYaw = 0;
  private patternIndex = 0;
  /** Seconds remaining before stop behavior may begin. */
  private recoveryDelay = 0;

  /** Pending transfer into permanent look — auto weapons only. */
  private pendingBakePitch = 0;
  private pendingBakeYaw = 0;

  /** Hooke's-law return toward look origin — semi / burst / melee. */
  private readonly pitchSpring: SpringDamper1D;
  private readonly yawSpring: SpringDamper1D;
  private springRecovering = false;

  /** Player mouse angular speed this frame (rad/s) — drives recoil smoothing. */
  private lookVelocity = 0;

  private readonly feel: RecoilFeel;
  /**
   * True for automatic weapons: stop-fire bakes kick into look.
   * False for single-shot / burst / melee: spring recovery to look origin.
   */
  private bakeOnStop: boolean;

  constructor(
    private config: RecoilConfig,
    weaponId: string,
    bakeOnStop = false,
  ) {
    const profile = getWeaponFeelProfile(weaponId);
    this.feel = profile.recoil;
    this.bakeOnStop = bakeOnStop;

    // Same camera spring as KickbackSystem — one Hooke's-law feel language.
    const spring = profile.kickback.cameraSpring;
    this.pitchSpring = new SpringDamper1D(spring.stiffness, spring.dampingRatio);
    this.yawSpring = new SpringDamper1D(spring.stiffness, spring.dampingRatio);
  }

  setConfig(config: RecoilConfig): void {
    this.config = config;
  }

  setBakeOnStop(bakeOnStop: boolean): void {
    this.bakeOnStop = bakeOnStop;
  }

  reset(): void {
    this.targetPitch = 0;
    this.targetYaw = 0;
    this.currentPitch = 0;
    this.currentYaw = 0;
    this.patternIndex = 0;
    this.recoveryDelay = 0;
    this.pendingBakePitch = 0;
    this.pendingBakeYaw = 0;
    this.springRecovering = false;
    this.pitchSpring.reset();
    this.yawSpring.reset();
  }

  /** Feed the current mouse angular speed (rad/s) each frame before firing. */
  setLookVelocity(radPerSec: number): void {
    this.lookVelocity = Math.max(0, radPerSec);
  }

  /** Fraction of incoming recoil removed by active counter-tracking (0–1). */
  private smoothingFactor(): number {
    const { smoothingThreshold, smoothingStrength } = this.feel;
    if (smoothingStrength <= 0 || this.lookVelocity <= smoothingThreshold) return 0;
    const over = Math.min(1, (this.lookVelocity - smoothingThreshold) / smoothingThreshold);
    return smoothingStrength * over;
  }

  onShot(adsBlend: number): void {
    const { pattern } = this.config;
    if (pattern.length === 0) return;

    // New shot interrupts spring recovery — continue from the live offset.
    this.springRecovering = false;

    const kick = pattern[this.patternIndex % pattern.length];
    this.patternIndex++;

    const mult = THREE.MathUtils.lerp(1, this.config.adsMultiplier, adsBlend);
    const yawScale = this.config.yawScale ?? 1;
    const cameraScale =
      this.config.cameraKickScale !== undefined && Number.isFinite(this.config.cameraKickScale)
        ? this.config.cameraKickScale
        : 1;

    const bloom = this.feel.bloom;
    const pitchJitter = 1 + (Math.random() * 2 - 1) * bloom;
    const yawJitter = 1 + (Math.random() * 2 - 1) * bloom;
    const yawScatter = (Math.random() * 2 - 1) * bloom * Math.abs(kick.pitch) * 0.25;

    const smoothing = 1 - this.smoothingFactor();

    this.targetPitch += kick.pitch * pitchJitter * mult * cameraScale * smoothing;
    this.targetYaw +=
      (kick.yaw * yawJitter + yawScatter) * mult * yawScale * cameraScale * smoothing;

    this.recoveryDelay = Math.max(this.recoveryDelay, this.feel.recoveryDelaySec);
  }

  update(delta: number, shooting: boolean, _ads: boolean): void {
    if (shooting) {
      this.recoveryDelay = Math.max(this.recoveryDelay, this.feel.recoveryDelaySec);
      this.springRecovering = false;
    } else {
      this.recoveryDelay = Math.max(0, this.recoveryDelay - delta);
    }

    if (this.bakeOnStop) {
      this.updateWhileFiring(delta);
      if (!shooting && this.recoveryDelay <= 0) {
        this.bakeCurrentOffset();
      }
      return;
    }

    // Semi / burst / melee: Hooke's-law return after the post-shot delay.
    if (!shooting && this.recoveryDelay <= 0) {
      this.updateSpringRecovery(delta);
    } else {
      this.updateWhileFiring(delta);
    }
  }

  /** Ease the view toward the accumulated pattern target (active fire). */
  private updateWhileFiring(delta: number): void {
    const aimBlend = expBlend(this.feel.aimSmoothSpeed, delta);
    this.currentPitch += (this.targetPitch - this.currentPitch) * aimBlend;
    this.currentYaw += (this.targetYaw - this.currentYaw) * aimBlend;

    if (Math.abs(this.currentPitch) < 1e-6) this.currentPitch = 0;
    if (Math.abs(this.currentYaw) < 1e-6) this.currentYaw = 0;
  }

  /**
   * Pull pattern offset back to look origin with the same damped harmonic
   * oscillator KickbackSystem uses for camera crack.
   */
  private updateSpringRecovery(delta: number): void {
    const hasOffset =
      Math.abs(this.currentPitch) > 1e-5 ||
      Math.abs(this.currentYaw) > 1e-5 ||
      Math.abs(this.targetPitch) > 1e-5 ||
      Math.abs(this.targetYaw) > 1e-5;

    if (!hasOffset) {
      this.springRecovering = false;
      this.patternIndex = 0;
      this.currentPitch = 0;
      this.currentYaw = 0;
      this.targetPitch = 0;
      this.targetYaw = 0;
      return;
    }

    if (!this.springRecovering) {
      this.springRecovering = true;
      // Seed from the authored target so any unfinished ease-in still recovers.
      this.pitchSpring.value = this.targetPitch;
      this.pitchSpring.velocity = 0;
      this.yawSpring.value = this.targetYaw;
      this.yawSpring.velocity = 0;
    }

    this.pitchSpring.update(delta, 0);
    this.yawSpring.update(delta, 0);

    this.targetPitch = this.pitchSpring.value;
    this.targetYaw = this.yawSpring.value;
    this.currentPitch = this.pitchSpring.value;
    this.currentYaw = this.yawSpring.value;

    if (
      Math.abs(this.pitchSpring.value) < 1e-5 &&
      Math.abs(this.yawSpring.value) < 1e-5 &&
      Math.abs(this.pitchSpring.velocity) < 1e-4 &&
      Math.abs(this.yawSpring.velocity) < 1e-4
    ) {
      this.targetPitch = 0;
      this.targetYaw = 0;
      this.currentPitch = 0;
      this.currentYaw = 0;
      this.springRecovering = false;
      this.patternIndex = 0;
      this.pitchSpring.reset();
      this.yawSpring.reset();
    }
  }

  /**
   * Transfer the visible recoil offset into look angles (via consumeBake)
   * and clear the temporary recoil layer with no camera motion.
   */
  private bakeCurrentOffset(): void {
    const hasOffset =
      Math.abs(this.currentPitch) > 1e-5 ||
      Math.abs(this.currentYaw) > 1e-5 ||
      Math.abs(this.targetPitch) > 1e-5 ||
      Math.abs(this.targetYaw) > 1e-5;
    if (!hasOffset) {
      this.patternIndex = 0;
      return;
    }

    this.pendingBakePitch += this.currentPitch;
    this.pendingBakeYaw += this.currentYaw;

    this.targetPitch = 0;
    this.targetYaw = 0;
    this.currentPitch = 0;
    this.currentYaw = 0;
    this.patternIndex = 0;
  }

  /**
   * Pull any pending bake into permanent look. Returns true when there was
   * something to apply (Player should update lookPitch/lookYaw).
   */
  consumeBake(out: { pitch: number; yaw: number }): boolean {
    if (Math.abs(this.pendingBakePitch) < 1e-7 && Math.abs(this.pendingBakeYaw) < 1e-7) {
      return false;
    }
    out.pitch = this.pendingBakePitch;
    out.yaw = this.pendingBakeYaw;
    this.pendingBakePitch = 0;
    this.pendingBakeYaw = 0;
    return true;
  }

  getOffset(): { pitch: number; yaw: number } {
    return { pitch: this.currentPitch, yaw: this.currentYaw };
  }

  applyAim(yawRig: THREE.Object3D, pitchRig: THREE.Object3D, basePitch: number): void {
    yawRig.rotation.set(0, this.currentYaw, 0);

    const totalPitch = THREE.MathUtils.clamp(
      basePitch + this.currentPitch,
      -AIM_PITCH_LIMIT,
      AIM_PITCH_LIMIT,
    );

    pitchRig.rotation.order = AIM_ROTATION_ORDER;
    pitchRig.rotation.set(totalPitch - basePitch, 0, 0);
  }
}
