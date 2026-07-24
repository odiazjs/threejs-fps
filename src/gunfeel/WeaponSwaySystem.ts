import * as THREE from 'three';
import { expBlend, layeredNoise1D, SpringDamper1D } from './gunFeelMath';
import { getWeaponFeelProfile, type SwayFeel } from './feelProfiles';

const TAU = Math.PI * 2;

/** Camera rotational sway relative to weapon rotation sway (shots follow camera). */
const CAMERA_SWAY_SCALE = 0.9;

const SWAY_BLEND_SPEED = 12;
const CARRY_BLEND_IN_SPEED = 14;
const CARRY_BLEND_OUT_SPEED = 9;

/** Hold carry briefly so grounded / input flicker does not retrigger sway. */
const CARRY_GROUNDED_GRACE_SEC = 0.14;
const CARRY_SHOOTING_GRACE_SEC = 0.1;
const ADS_BLOCK_CARRY_BLEND = 0.16;
const ADS_ALLOW_CARRY_BLEND = 0.1;

/** Right-side high carry — disabled for now (FPS arms sprint anim later). */
const SPRINT_CARRY = {
  position: { x: 0.12, y: 0.05, z: -0.1 },
  rotation: { x: 1.48, y: -0.1, z: -0.32 },
  bobAmp: 0,
  bobFreq: 3.1,
  /** When false, sprint does not lift/bob the weapon mesh. */
  enabled: false,
} as const;

const _basePos = new THREE.Vector3();
const _baseRot = new THREE.Euler();
const _baseQuat = new THREE.Quaternion();
const _carryOffset = new THREE.Vector3();
const _carryRot = new THREE.Euler();
const _carryQuat = new THREE.Quaternion();
const _targetPos = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();

export interface SwayFrameInput {
  /** Strafe input: -1 (A) .. 1 (D). Weapon shifts opposite. */
  moveX: number;
  /** Forward input: -1 (S) .. 1 (W). Weapon pulls back slightly on advance. */
  moveZ: number;
  /** Mouse look deltas this frame (radians) — drives look-lag. */
  lookDeltaYaw: number;
  lookDeltaPitch: number;
  walking: boolean;
  sprinting: boolean;
  shooting: boolean;
  grounded: boolean;
  adsBlend: number;
  reloading: boolean;
  /** Hold-breath input (sniper stabilizer). */
  holdingBreath: boolean;
}

/**
 * Weapon weight: layered-noise figure-8 idle sway, movement sway opposite to
 * strafe, and spring-driven look-lag so the model trails fast camera flicks.
 * Also owns the sprint high-carry pose and the sniper hold-breath meter.
 *
 * TRANSFORM HOOKUP: `apply(weaponMesh, baseRotation)` runs after the pose +
 * kickback layers each frame; `applyCamera(yawRecoilRig, pitchRecoilRig)`
 * runs inside Player.applyActiveRecoilAim after recoil.
 */
export class WeaponSwaySystem {
  private feel: SwayFeel;

  private phase = 0;
  private noiseTime = 0;
  private carryPhase = 0;
  private walkBlend = 0;
  private carryBlend = 0;
  private carryGroundedGrace = 0;
  private carryShootingGrace = 0;
  private adsBlocksCarry = false;
  private wasShooting = false;

  /** 0..1 sway scale computed per frame (ADS / reload / breath). */
  private swayScale = 1;
  /** Look-lag scale this frame (ADS can zero it for sniper). */
  private lookLagScale = 1;
  private reloading = false;

  /** Smoothed movement-sway offset (m). */
  private moveOffsetX = 0;
  private moveOffsetZ = 0;

  /** Look-lag springs — displaced by look deltas, pulled home by Hooke's law. */
  private readonly lagYaw: SpringDamper1D;
  private readonly lagPitch: SpringDamper1D;

  /** Breath meter 0..1 (sniper hold-breath). */
  private breath = 1;
  private breathHeld = false;

  constructor(weaponId = 'plasma_rifle') {
    this.feel = getWeaponFeelProfile(weaponId).sway;
    const lag = this.feel.lookLag.spring;
    this.lagYaw = new SpringDamper1D(lag.stiffness, lag.dampingRatio);
    this.lagPitch = new SpringDamper1D(lag.stiffness, lag.dampingRatio);
  }

  /** Swap tuning when the active weapon changes; lag springs re-tune live. */
  setWeapon(weaponId: string): void {
    const next = getWeaponFeelProfile(weaponId).sway;
    if (next === this.feel) return;
    this.feel = next;
    const lag = next.lookLag.spring;
    this.lagYaw.configure(lag.stiffness, lag.dampingRatio);
    this.lagPitch.configure(lag.stiffness, lag.dampingRatio);
  }

  reset(): void {
    this.phase = 0;
    this.noiseTime = 0;
    this.carryPhase = 0;
    this.walkBlend = 0;
    this.carryBlend = 0;
    this.carryGroundedGrace = 0;
    this.carryShootingGrace = 0;
    this.adsBlocksCarry = false;
    this.wasShooting = false;
    this.swayScale = 1;
    this.lookLagScale = 1;
    this.reloading = false;
    this.moveOffsetX = 0;
    this.moveOffsetZ = 0;
    this.lagYaw.reset();
    this.lagPitch.reset();
    this.breath = 1;
    this.breathHeld = false;
  }

  getCarryBlend(): number {
    return this.carryBlend;
  }

  /** Remaining breath 0..1 (for a future stamina-style HUD readout). */
  getBreath(): number {
    return this.breath;
  }

  isHoldingBreath(): boolean {
    return this.breathHeld;
  }

  update(delta: number, input: SwayFrameInput): void {
    const feel = this.feel;
    this.reloading = input.reloading;

    /* ---- sprint carry state (kept from the legacy system) ---- */
    const walkActive = input.grounded && input.walking && !input.sprinting && !input.reloading;

    if (input.grounded && input.sprinting) {
      this.carryGroundedGrace = CARRY_GROUNDED_GRACE_SEC;
    } else {
      this.carryGroundedGrace = Math.max(0, this.carryGroundedGrace - delta);
    }

    if (input.shooting) {
      if (this.carryShootingGrace > 0) {
        this.carryShootingGrace = Math.max(0, this.carryShootingGrace - delta);
      }
    } else if (this.wasShooting) {
      this.carryShootingGrace = CARRY_SHOOTING_GRACE_SEC;
    } else if (this.carryShootingGrace > 0) {
      this.carryShootingGrace = Math.max(0, this.carryShootingGrace - delta);
    }
    this.wasShooting = input.shooting;

    if (this.adsBlocksCarry) {
      if (input.adsBlend < ADS_ALLOW_CARRY_BLEND) this.adsBlocksCarry = false;
    } else if (input.adsBlend > ADS_BLOCK_CARRY_BLEND) {
      this.adsBlocksCarry = true;
    }

    const carryRaw =
      SPRINT_CARRY.enabled
      && (input.grounded || this.carryGroundedGrace > 0)
      && input.sprinting
      && (this.carryShootingGrace > 0 || !input.shooting)
      && !this.adsBlocksCarry
      && !input.reloading;

    const walkStep = expBlend(SWAY_BLEND_SPEED, delta);
    const carryStep = expBlend(carryRaw ? CARRY_BLEND_IN_SPEED : CARRY_BLEND_OUT_SPEED, delta);
    this.walkBlend += ((walkActive ? 1 : 0) - this.walkBlend) * walkStep;
    this.carryBlend += ((carryRaw ? 1 : 0) - this.carryBlend) * carryStep;
    if (input.reloading) {
      // Hard-cut sprint carry so reload pose isn't lerped into the high-ready.
      this.carryBlend = 0;
      this.carryPhase = 0;
    }

    /* ---- breath (sniper stabilizer) ---- */
    const breath = feel.breath;
    let breathScale = 1;
    if (breath) {
      const wantsHold = input.holdingBreath && input.adsBlend > 0.6;
      this.breathHeld = wantsHold && this.breath > 0;
      if (this.breathHeld) {
        this.breath = Math.max(0, this.breath - delta / breath.holdDurationSec);
        breathScale = breath.holdSteadyScale;
      } else {
        this.breath = Math.min(1, this.breath + breath.recoverPerSec * delta);
      }
    } else {
      this.breathHeld = false;
      this.breath = 1;
    }

    /* ---- amplitude for this frame ---- */
    // ADS: weapons steady up (adsScale < 1). Sniper applies a small
    // breath.adsAmpMultiplier unless Shift hold-breath is active.
    const adsAmp = breath
      ? feel.adsScale * breath.adsAmpMultiplier * breathScale
      : feel.adsScale;
    const adsFactor = THREE.MathUtils.lerp(1, adsAmp, input.adsBlend);
    const reloadDamp = input.reloading ? 0.12 : 1;
    this.swayScale = adsFactor * reloadDamp * (1 - this.carryBlend);
    this.lookLagScale = THREE.MathUtils.lerp(1, feel.lookLagAdsScale, input.adsBlend);

    /* ---- phase advance ---- */
    const freq = feel.idleFreq * THREE.MathUtils.lerp(1, feel.walkFreqMultiplier, this.walkBlend);
    this.phase += delta * freq;
    this.noiseTime += delta;
    if (this.carryBlend > 0.01) {
      this.carryPhase += delta * SPRINT_CARRY.bobFreq;
    } else if (this.carryPhase !== 0) {
      this.carryPhase = 0;
    }

    /* ---- movement sway (opposite of strafe) ---- */
    const moveStep = expBlend(feel.moveSwaySmoothing, delta);
    const targetX = -input.moveX * feel.moveSwayAmp * adsFactor;
    const targetZ = input.moveZ * feel.moveSwayAmp * 0.55 * adsFactor;
    this.moveOffsetX += (targetX - this.moveOffsetX) * moveStep;
    this.moveOffsetZ += (targetZ - this.moveOffsetZ) * moveStep;

    /* ---- look-lag ---- */
    const lag = feel.lookLag;
    if (this.lookLagScale <= 0.001) {
      // Fully suppressed (e.g. sniper ADS) — clear residual hipfire lag.
      this.lagYaw.reset();
      this.lagPitch.reset();
    } else if (delta > 0) {
      // Camera moved by delta — the weapon "stays behind" by weight fraction.
      const lagIn = lag.weight * this.lookLagScale;
      const maxRad = lag.maxRad * this.lookLagScale;
      this.lagYaw.value = THREE.MathUtils.clamp(
        this.lagYaw.value - input.lookDeltaYaw * lagIn,
        -maxRad,
        maxRad,
      );
      this.lagPitch.value = THREE.MathUtils.clamp(
        this.lagPitch.value - input.lookDeltaPitch * lagIn,
        -maxRad,
        maxRad,
      );
      this.lagYaw.update(delta);
      this.lagPitch.update(delta);
    } else {
      this.lagYaw.update(delta);
      this.lagPitch.update(delta);
    }
  }

  private walkAmpFactor(): number {
    return THREE.MathUtils.lerp(1, this.feel.walkAmpMultiplier, this.walkBlend);
  }

  apply(weapon: THREE.Object3D, baseRotation: THREE.Euler): void {
    const feel = this.feel;
    _basePos.copy(weapon.position);
    _baseRot.copy(baseRotation);
    _baseQuat.setFromEuler(_baseRot);

    /* ---- sprint high-carry pose ---- */
    if (this.carryBlend > 0.001) {
      const bobY = Math.sin(this.carryPhase * TAU) * SPRINT_CARRY.bobAmp;
      _carryOffset.set(
        SPRINT_CARRY.position.x,
        SPRINT_CARRY.position.y + bobY,
        SPRINT_CARRY.position.z,
      );
      _targetPos.copy(_basePos).add(_carryOffset);

      _carryRot.copy(_baseRot);
      _carryRot.x += SPRINT_CARRY.rotation.x;
      _carryRot.y += SPRINT_CARRY.rotation.y;
      _carryRot.z += SPRINT_CARRY.rotation.z;
      _carryQuat.setFromEuler(_carryRot);

      weapon.position.lerpVectors(_basePos, _targetPos, this.carryBlend);
      _targetQuat.copy(_baseQuat).slerp(_carryQuat, this.carryBlend);
      weapon.rotation.setFromQuaternion(_targetQuat);
    }

    /* ---- idle / walk figure-8 + layered noise ---- */
    const walkAmp = this.walkAmpFactor();
    const p = feel.idleAmp * walkAmp * this.swayScale;
    const r = feel.idleRotAmp * walkAmp * this.swayScale;

    if (p > 0 || r > 0) {
      const t = this.phase * TAU;
      // Lissajous 1:2 — the classic figure-8 loop.
      const fig8X = Math.sin(t);
      const fig8Y = Math.sin(t * 2) * 0.5;
      const nX = layeredNoise1D(this.noiseTime * 0.55, 3.1) * feel.noiseAmp;
      const nY = layeredNoise1D(this.noiseTime * 0.47, 7.7) * feel.noiseAmp;

      weapon.position.x += (fig8X + nX) * p;
      weapon.position.y += (fig8Y + nY) * p * 0.85;
      weapon.position.z += Math.sin(t * 0.61 + 1.35) * p * 0.3;

      weapon.rotation.x += (fig8Y + nY * 0.7) * r * 0.6;
      weapon.rotation.y += (fig8X * 0.4 + nX * 0.5) * r * 0.5;
      weapon.rotation.z += fig8X * r;
    }

    /* ---- movement sway + look-lag (suppressed by carry / reload) ---- */
    const dynScale = (1 - this.carryBlend) * (this.reloading ? 0.2 : 1);
    if (dynScale > 0.001) {
      weapon.position.x += this.moveOffsetX * dynScale;
      weapon.position.z += this.moveOffsetZ * dynScale;
      weapon.rotation.z += this.moveOffsetX * 2.2 * dynScale;

      const lag = this.feel.lookLag;
      const lagYaw = this.lagYaw.value * dynScale * this.lookLagScale;
      const lagPitch = this.lagPitch.value * dynScale * this.lookLagScale;
      weapon.rotation.y += lagYaw;
      weapon.rotation.x += lagPitch;
      weapon.position.x += lagYaw * lag.posPerRad;
      weapon.position.y += lagPitch * lag.posPerRad * 0.6;
    }
  }

  /**
   * Additive camera breathe on the recoil rigs (after recoil applyAim).
   * Deliberately excludes look-lag — camera stays crisp, only the model lags.
   */
  applyCamera(yawRig: THREE.Object3D, pitchRig: THREE.Object3D): void {
    const r = this.feel.idleRotAmp * this.walkAmpFactor() * this.swayScale * CAMERA_SWAY_SCALE;
    if (r <= 0) return;

    const t = this.phase * TAU;
    const nX = layeredNoise1D(this.noiseTime * 0.55, 3.1) * this.feel.noiseAmp;
    const nY = layeredNoise1D(this.noiseTime * 0.47, 7.7) * this.feel.noiseAmp;
    yawRig.rotation.y += (Math.sin(t) * 0.4 + nX * 0.6) * r * 0.55;
    pitchRig.rotation.x += (Math.sin(t * 2) * 0.35 + nY * 0.6) * r * 0.7;
  }
}
