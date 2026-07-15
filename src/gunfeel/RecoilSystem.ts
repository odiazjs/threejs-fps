import * as THREE from 'three';
import type { RecoilConfig } from '../../shared/content/weaponConfig';
import { AIM_PITCH_LIMIT, AIM_ROTATION_ORDER } from '../player/playerAim';
import { expBlend, sampleRecoveryCurve } from './gunFeelMath';
import { getWeaponFeelProfile, type RecoilFeel } from './feelProfiles';

/**
 * Camera recoil: deterministic spray pattern + Apex-style recoil smoothing +
 * curve-driven recovery.
 *
 * - The spray path comes from `RecoilConfig.pattern` (authored per weapon,
 *   amplitude-scaled by the Armory recoil stat via `cameraKickScale`).
 * - `bloom` jitters each pattern step slightly so no two sprays are pixel
 *   identical.
 * - While the player counter-tracks faster than `smoothingThreshold`, incoming
 *   kicks are damped by up to `smoothingStrength` (recoil smoothing).
 * - When fire stops, the accumulated offset returns to the look origin along
 *   an authored easing curve — not a linear/exponential lerp.
 *
 * INPUT HOOKUP: call `setLookVelocity` once per frame with the player's mouse
 * angular speed (rad/s), `onShot` per bullet, `update` per frame, then
 * `applyAim(yawRecoilRig, pitchRecoilRig, lookPitch)` after mouse look has
 * been applied to the aim rigs (see Player.applyActiveRecoilAim).
 */
export class RecoilSystem {
  /** Accumulated pattern offset the view is being pushed toward. */
  private targetPitch = 0;
  private targetYaw = 0;
  /** Smoothed view offset — eases toward the target. */
  private currentPitch = 0;
  private currentYaw = 0;
  private patternIndex = 0;
  /** Seconds remaining before recovery may begin. */
  private recoveryDelay = 0;

  /** Curve-driven recovery state. */
  private recovering = false;
  private recoveryT = 0;
  private recoveryStartPitch = 0;
  private recoveryStartYaw = 0;

  /** Player mouse angular speed this frame (rad/s) — drives recoil smoothing. */
  private lookVelocity = 0;

  private readonly feel: RecoilFeel;

  constructor(
    private config: RecoilConfig,
    weaponId: string,
  ) {
    this.feel = getWeaponFeelProfile(weaponId).recoil;
  }

  setConfig(config: RecoilConfig): void {
    this.config = config;
  }

  reset(): void {
    this.targetPitch = 0;
    this.targetYaw = 0;
    this.currentPitch = 0;
    this.currentYaw = 0;
    this.patternIndex = 0;
    this.recoveryDelay = 0;
    this.recovering = false;
    this.recoveryT = 0;
  }

  /** Feed the current mouse angular speed (rad/s) each frame before firing. */
  setLookVelocity(radPerSec: number): void {
    this.lookVelocity = Math.max(0, radPerSec);
  }

  /** Fraction of incoming recoil removed by active counter-tracking (0–1). */
  private smoothingFactor(): number {
    const { smoothingThreshold, smoothingStrength } = this.feel;
    if (smoothingStrength <= 0 || this.lookVelocity <= smoothingThreshold) return 0;
    // Ramps in over one extra threshold-width of speed, then saturates.
    const over = Math.min(1, (this.lookVelocity - smoothingThreshold) / smoothingThreshold);
    return smoothingStrength * over;
  }

  onShot(adsBlend: number): void {
    const { pattern } = this.config;
    if (pattern.length === 0) return;

    // Resuming fire mid-recovery continues from wherever the view settled.
    this.recovering = false;
    this.recoveryT = 0;

    const kick = pattern[this.patternIndex % pattern.length];
    this.patternIndex++;

    const mult = THREE.MathUtils.lerp(1, this.config.adsMultiplier, adsBlend);
    const yawScale = this.config.yawScale ?? 1;
    const cameraScale =
      this.config.cameraKickScale !== undefined && Number.isFinite(this.config.cameraKickScale)
        ? this.config.cameraKickScale
        : 1;

    // Bloom: small multiplicative variance so the spray isn't 100% identical,
    // plus a whisper of extra yaw scatter derived from pitch magnitude (keeps
    // pure-vertical patterns pure but alive).
    const bloom = this.feel.bloom;
    const pitchJitter = 1 + (Math.random() * 2 - 1) * bloom;
    const yawJitter = 1 + (Math.random() * 2 - 1) * bloom;
    const yawScatter = (Math.random() * 2 - 1) * bloom * Math.abs(kick.pitch) * 0.25;

    // Recoil smoothing — fast tracking eats part of the incoming kick.
    const smoothing = 1 - this.smoothingFactor();

    this.targetPitch += kick.pitch * pitchJitter * mult * cameraScale * smoothing;
    this.targetYaw +=
      (kick.yaw * yawJitter + yawScatter) * mult * yawScale * cameraScale * smoothing;

    this.recoveryDelay = Math.max(this.recoveryDelay, this.feel.recoveryDelaySec);
  }

  update(delta: number, shooting: boolean, ads: boolean): void {
    if (shooting) {
      this.recoveryDelay = Math.max(this.recoveryDelay, this.feel.recoveryDelaySec);
      this.recovering = false;
      this.recoveryT = 0;
    } else {
      this.recoveryDelay = Math.max(0, this.recoveryDelay - delta);
    }

    const hasOffset = Math.abs(this.targetPitch) > 1e-4 || Math.abs(this.targetYaw) > 1e-4;

    if (!shooting && this.recoveryDelay <= 0 && hasOffset) {
      if (!this.recovering) {
        this.recovering = true;
        this.recoveryT = 0;
        this.recoveryStartPitch = this.targetPitch;
        this.recoveryStartYaw = this.targetYaw;
      }

      // ADS recovers a touch faster — the stock is braced.
      const speedScale = ads ? 1.15 : 1;
      this.recoveryT += (delta * speedScale) / Math.max(0.016, this.feel.recoveryDurationSec);
      const eased = sampleRecoveryCurve(this.feel.recoveryCurve, this.recoveryT);
      this.targetPitch = this.recoveryStartPitch * (1 - eased);
      this.targetYaw = this.recoveryStartYaw * (1 - eased);

      if (this.recoveryT >= 1) {
        this.targetPitch = 0;
        this.targetYaw = 0;
        this.recovering = false;
        this.patternIndex = 0;
      }
    }

    const aimBlend = expBlend(this.feel.aimSmoothSpeed, delta);
    this.currentPitch += (this.targetPitch - this.currentPitch) * aimBlend;
    this.currentYaw += (this.targetYaw - this.currentYaw) * aimBlend;

    if (Math.abs(this.currentPitch) < 1e-6) this.currentPitch = 0;
    if (Math.abs(this.currentYaw) < 1e-6) this.currentYaw = 0;
  }

  /** Current camera offset — read by the kickback/HUD layers if needed. */
  getOffset(): { pitch: number; yaw: number } {
    return { pitch: this.currentPitch, yaw: this.currentYaw };
  }

  /**
   * Yaw on a parent of pointer-lock aim; pitch on a child after aim.
   * Pitch on the parent would tilt the aim frame and feel disorienting.
   */
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
