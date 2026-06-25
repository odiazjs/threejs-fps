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

/** Snappy blends for locomotion + carry pose. */
const SWAY_BLEND_SPEED = 12;
const CARRY_BLEND_SPEED = 16;
const ADS_SWAY_REDUCTION = 0.42;

/** Right-side high carry — muzzle toward the sky while sprinting. */
const SPRINT_CARRY = {
  position: { x: 0.15, y: 0.05, z: -0.1 },
  rotation: { x: 1.48, y: -0.1, z: -0.32 },
  bobAmp: 0.016,
  bobFreq: 3.1,
} as const;

const _combatPos = new THREE.Vector3();
const _combatRot = new THREE.Euler();
const _combatQuat = new THREE.Quaternion();
const _targetPos = new THREE.Vector3();
const _targetRot = new THREE.Euler();
const _targetQuat = new THREE.Quaternion();
const _lerpQuat = new THREE.Quaternion();

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

  reset(): void {
    this.phase = 0;
    this.carryPhase = 0;
    this.walkBlend = 0;
    this.carryBlend = 0;
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
    const carryWanted =
      grounded && sprinting && !shooting && adsBlend < 0.12;

    const walkBlend = 1 - Math.exp(-SWAY_BLEND_SPEED * delta);
    const carryStep = 1 - Math.exp(-CARRY_BLEND_SPEED * delta);

    this.walkBlend += ((walkActive ? 1 : 0) - this.walkBlend) * walkBlend;
    this.carryBlend += ((carryWanted ? 1 : 0) - this.carryBlend) * carryStep;

    const idleWeight = (1 - this.walkBlend) * (1 - this.carryBlend);
    const walkWeight = this.walkBlend * (1 - this.carryBlend);

    this.posAmp = (SWAY_IDLE.pos * idleWeight + SWAY_WALK.pos * walkWeight) * weaponScale;
    this.rotAmp = (SWAY_IDLE.rot * idleWeight + SWAY_WALK.rot * walkWeight) * weaponScale;
    this.freq = SWAY_IDLE.freq * idleWeight + SWAY_WALK.freq * walkWeight;

    this.phase += delta * this.freq;
    if (this.carryBlend > 0.01) {
      this.carryPhase += delta * SPRINT_CARRY.bobFreq;
    } else if (this.carryPhase !== 0) {
      this.carryPhase = 0;
    }

    this.adsDamp = 1 - adsBlend * ADS_SWAY_REDUCTION;
  }

  apply(weapon: THREE.Object3D, hip: THREE.Vector3, baseRotation: THREE.Euler): void {
    _combatPos.copy(weapon.position);
    _combatRot.copy(weapon.rotation);
    _combatQuat.setFromEuler(_combatRot);

    if (this.carryBlend > 0.001) {
      const bobY = Math.sin(this.carryPhase * TAU) * SPRINT_CARRY.bobAmp;

      _targetPos.set(
        hip.x + SPRINT_CARRY.position.x,
        hip.y + SPRINT_CARRY.position.y + bobY,
        hip.z + SPRINT_CARRY.position.z,
      );

      _targetRot.copy(baseRotation);
      _targetRot.x += SPRINT_CARRY.rotation.x;
      _targetRot.y += SPRINT_CARRY.rotation.y;
      _targetRot.z += SPRINT_CARRY.rotation.z;
      _targetQuat.setFromEuler(_targetRot);

      weapon.position.lerpVectors(_combatPos, _targetPos, this.carryBlend);
      _lerpQuat.copy(_combatQuat).slerp(_targetQuat, this.carryBlend);
      weapon.rotation.setFromQuaternion(_lerpQuat);
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
