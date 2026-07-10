import * as THREE from 'three';
import type { RecoilConfig } from '../../shared/content/weaponConfig';
import { AIM_PITCH_LIMIT, AIM_ROTATION_ORDER } from '../player/playerAim';

const DEFAULT_AIM_SMOOTH_SPEED = 18;
/** Hold kick before recovery starts (covers semi-auto one-frame fire flags). */
const DEFAULT_RECOVERY_DELAY_SEC = 0.14;

const _weaponPos = new THREE.Vector3();
const _weaponRot = new THREE.Euler();

const DEFAULT_VISUAL_STYLE = {
  rotX: -0.18,
  rotYFromYaw: 0.55,
  rotZ: 0.08,
  posXFromYaw: 0.18,
  posY: -0.025,
  posZ: 0.04,
  kickBack: 0.08,
  kickUp: -0.02,
} as const;

export class WeaponRecoil {
  /** Accumulated recoil target — decays after recovery delay when not firing. */
  private targetPitch = 0;
  private targetYaw = 0;
  /** Smoothed view offset — eases toward target. */
  private currentPitch = 0;
  private currentYaw = 0;
  private patternIndex = 0;
  private visualImpulse = 0;
  private visualCurrent = 0;
  /** Seconds remaining before aim recovery may begin. */
  private recoveryDelay = 0;

  constructor(private config: RecoilConfig) {}

  setConfig(config: RecoilConfig): void {
    this.config = config;
  }

  reset(): void {
    this.targetPitch = 0;
    this.targetYaw = 0;
    this.currentPitch = 0;
    this.currentYaw = 0;
    this.patternIndex = 0;
    this.visualImpulse = 0;
    this.visualCurrent = 0;
    this.recoveryDelay = 0;
  }

  onShot(adsBlend: number): void {
    const { pattern } = this.config;
    if (pattern.length === 0) return;

    const kick = pattern[this.patternIndex % pattern.length];
    this.patternIndex++;

    const mult = THREE.MathUtils.lerp(1, this.config.adsMultiplier, adsBlend);
    const yawScale = this.config.yawScale ?? 1;
    this.targetPitch += kick.pitch * mult;
    this.targetYaw += kick.yaw * mult * yawScale;

    // Visual punch — allow stacking a bit so rapid fire still reads.
    this.visualImpulse = Math.min(1.35, this.visualImpulse + 0.7);
    this.recoveryDelay = Math.max(
      this.recoveryDelay,
      this.config.recoveryDelaySec ?? DEFAULT_RECOVERY_DELAY_SEC,
    );
  }

  update(delta: number, shooting: boolean, ads: boolean): void {
    if (shooting) {
      // Keep pattern while trigger is held (auto); delay recovery.
      this.recoveryDelay = Math.max(
        this.recoveryDelay,
        this.config.recoveryDelaySec ?? DEFAULT_RECOVERY_DELAY_SEC,
      );
    } else {
      this.recoveryDelay = Math.max(0, this.recoveryDelay - delta);
    }

    const canRecover = !shooting && this.recoveryDelay <= 0;
    if (canRecover) {
      const recoveryScale = ads ? 1.15 : 1;
      const decay = 1 - Math.exp(-this.config.recoverySpeed * recoveryScale * delta);
      this.targetPitch *= 1 - decay;
      this.targetYaw *= 1 - decay;

      if (Math.abs(this.targetPitch) < 1e-4 && Math.abs(this.targetYaw) < 1e-4) {
        this.targetPitch = 0;
        this.targetYaw = 0;
        this.patternIndex = 0;
      }
    }

    const aimSmooth = this.config.aimSmoothSpeed ?? DEFAULT_AIM_SMOOTH_SPEED;
    const aimBlend = 1 - Math.exp(-aimSmooth * delta);
    this.currentPitch += (this.targetPitch - this.currentPitch) * aimBlend;
    this.currentYaw += (this.targetYaw - this.currentYaw) * aimBlend;

    const visualDecay = 1 - Math.exp(-this.config.visualRecoverySpeed * delta);
    this.visualImpulse *= 1 - visualDecay;
    this.visualCurrent += (this.visualImpulse - this.visualCurrent) * aimBlend;

    if (Math.abs(this.currentPitch) < 1e-6) this.currentPitch = 0;
    if (Math.abs(this.currentYaw) < 1e-6) this.currentYaw = 0;
    if (this.visualImpulse < 1e-4) this.visualImpulse = 0;
    if (this.visualCurrent < 1e-4) this.visualCurrent = 0;
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

  applyWeaponVisual(
    weapon: THREE.Object3D,
    baseRotation: THREE.Euler,
    adsBlend: number,
  ): void {
    _weaponPos.copy(weapon.position);
    _weaponRot.copy(baseRotation);

    if (this.visualCurrent <= 0) {
      weapon.rotation.copy(_weaponRot);
      weapon.position.copy(_weaponPos);
      return;
    }

    const adsVisual = this.config.adsVisualMultiplier ?? 0.6;
    const adsScale = THREE.MathUtils.lerp(1, adsVisual, adsBlend);
    const rotKick = this.config.visualKick * this.visualCurrent * adsScale;
    const pushKick =
      this.config.visualKick *
      Math.max(this.visualCurrent, this.visualImpulse * 0.9) *
      adsScale;

    const style = { ...DEFAULT_VISUAL_STYLE, ...this.config.visualStyle };
    const yawSign = Math.sign(this.currentYaw || 1);

    weapon.rotation.set(
      _weaponRot.x + style.rotX * rotKick,
      _weaponRot.y + this.currentYaw * style.rotYFromYaw,
      _weaponRot.z + style.rotZ * rotKick * yawSign,
    );
    weapon.position.set(
      _weaponPos.x + this.currentYaw * rotKick * style.posXFromYaw,
      _weaponPos.y + style.posY * rotKick + style.kickUp * pushKick,
      _weaponPos.z + style.posZ * rotKick + style.kickBack * pushKick,
    );
  }
}
