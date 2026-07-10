import * as THREE from 'three';
import type { WeaponSwayConfig } from '../../shared/content/weaponConfig';

const TAU = Math.PI * 2;

interface SwayProfile {
  readonly pos: number;
  readonly rot: number;
  readonly freq: number;
}

const SWAY_IDLE: SwayProfile = { pos: 0.002, rot: 0.0028, freq: 0.42 };
const SWAY_WALK: SwayProfile = { pos: 0.0055, rot: 0.0065, freq: 1.15 };

const SWAY_BLEND_SPEED = 12;
const CARRY_BLEND_IN_SPEED = 14;
const CARRY_BLEND_OUT_SPEED = 9;
const ADS_SWAY_REDUCTION = 0.42;

/** Hold carry briefly so grounded / input flicker does not retrigger sway. */
const CARRY_GROUNDED_GRACE_SEC = 0.14;
const CARRY_SHOOTING_GRACE_SEC = 0.1;
const ADS_BLOCK_CARRY_BLEND = 0.16;
const ADS_ALLOW_CARRY_BLEND = 0.1;

/** Right-side high carry — muzzle toward the sky while sprinting. */
const SPRINT_CARRY = {
  position: { x: 0.12, y: 0.05, z: -0.1 },
  rotation: { x: 1.48, y: -0.1, z: -0.32 },
  /** Vertical bob while sprinting in the high-carry pose. */
  bobAmp: 0.016,
  bobFreq: 3.1,
} as const;

const _basePos = new THREE.Vector3();
const _baseRot = new THREE.Euler();
const _baseQuat = new THREE.Quaternion();
const _carryOffset = new THREE.Vector3();
const _carryRot = new THREE.Euler();
const _carryQuat = new THREE.Quaternion();
const _targetPos = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();

/**
 * Idle / walk weapon sway plus sprint high-carry pose when not firing.
 */
export class WeaponSway {
  private phase = 0;
  private carryPhase = 0;
  private adsDamp = 1;
  private posAmp = SWAY_IDLE.pos;
  private rotAmp = SWAY_IDLE.rot;
  private freq = SWAY_IDLE.freq;
  private walkBlend = 0;
  private carryBlend = 0;
  private carryGroundedGrace = 0;
  private carryShootingGrace = 0;
  private adsBlocksCarry = false;
  private wasShooting = false;

  reset(): void {
    this.phase = 0;
    this.carryPhase = 0;
    this.walkBlend = 0;
    this.carryBlend = 0;
    this.carryGroundedGrace = 0;
    this.carryShootingGrace = 0;
    this.adsBlocksCarry = false;
    this.wasShooting = false;
    this.adsDamp = 1;
    this.posAmp = SWAY_IDLE.pos;
    this.rotAmp = SWAY_IDLE.rot;
    this.freq = SWAY_IDLE.freq;
  }

  getCarryBlend(): number {
    return this.carryBlend;
  }

  update(
    delta: number,
    walking: boolean,
    sprinting: boolean,
    shooting: boolean,
    grounded: boolean,
    adsBlend: number,
    config?: WeaponSwayConfig,
  ): void {
    const weaponScale = config?.intensity ?? 1;
    const walkActive = grounded && walking && !sprinting;

    if (grounded && sprinting) {
      this.carryGroundedGrace = CARRY_GROUNDED_GRACE_SEC;
    } else {
      this.carryGroundedGrace = Math.max(0, this.carryGroundedGrace - delta);
    }

    if (shooting) {
      if (this.carryShootingGrace > 0) {
        this.carryShootingGrace = Math.max(0, this.carryShootingGrace - delta);
      }
    } else if (this.wasShooting) {
      this.carryShootingGrace = CARRY_SHOOTING_GRACE_SEC;
    } else if (this.carryShootingGrace > 0) {
      this.carryShootingGrace = Math.max(0, this.carryShootingGrace - delta);
    }
    this.wasShooting = shooting;

    if (this.adsBlocksCarry) {
      if (adsBlend < ADS_ALLOW_CARRY_BLEND) {
        this.adsBlocksCarry = false;
      }
    } else if (adsBlend > ADS_BLOCK_CARRY_BLEND) {
      this.adsBlocksCarry = true;
    }

    const carryRaw =
      (grounded || this.carryGroundedGrace > 0)
      && sprinting
      && (this.carryShootingGrace > 0 || !shooting)
      && !this.adsBlocksCarry;

    const walkStep = 1 - Math.exp(-SWAY_BLEND_SPEED * delta);
    const carryStep = 1 - Math.exp(
      -(carryRaw ? CARRY_BLEND_IN_SPEED : CARRY_BLEND_OUT_SPEED) * delta,
    );

    this.walkBlend += ((walkActive ? 1 : 0) - this.walkBlend) * walkStep;
    this.carryBlend += ((carryRaw ? 1 : 0) - this.carryBlend) * carryStep;

    const locomotionBlend = this.walkBlend * (1 - this.carryBlend);
    const idleWeight = (1 - locomotionBlend) * (1 - this.carryBlend);

    this.posAmp = (SWAY_IDLE.pos * idleWeight + SWAY_WALK.pos * locomotionBlend) * weaponScale;
    this.rotAmp = (SWAY_IDLE.rot * idleWeight + SWAY_WALK.rot * locomotionBlend) * weaponScale;
    this.freq = SWAY_IDLE.freq * idleWeight + SWAY_WALK.freq * locomotionBlend;

    this.phase += delta * this.freq;
    if (this.carryBlend > 0.01) {
      this.carryPhase += delta * SPRINT_CARRY.bobFreq;
    } else if (this.carryPhase !== 0) {
      this.carryPhase = 0;
    }

    this.adsDamp = 1 - adsBlend * ADS_SWAY_REDUCTION;
  }

  apply(weapon: THREE.Object3D, baseRotation: THREE.Euler): void {
    _basePos.copy(weapon.position);
    _baseRot.copy(baseRotation);
    _baseQuat.setFromEuler(_baseRot);

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

    const swayScale = (1 - this.carryBlend) * this.adsDamp;
    const p = this.posAmp * swayScale;
    const r = this.rotAmp * swayScale;
    if (p <= 0 && r <= 0) return;

    const t = this.phase * TAU;
    weapon.position.x += Math.sin(t) * p + Math.sin(t * 0.48 + 0.9) * p * 0.28;
    weapon.position.y += Math.cos(t * 1.12) * p * 0.75;
    weapon.position.z += Math.sin(t * 0.61 + 1.35) * p * 0.35;

    weapon.rotation.x += Math.sin(t * 0.53 + 0.4) * r * 0.35;
    weapon.rotation.y += Math.cos(t * 0.37) * r * 0.28;
    weapon.rotation.z += Math.sin(t * 0.88) * r;
  }
}
