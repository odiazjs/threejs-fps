import * as THREE from 'three';
import { GRENADE_BLAST_RADIUS } from '../../shared/throwables/grenadeConfig';

const TRAUMA_DECAY = 3.2;
const MAX_SHAKE_DISTANCE_MUL = 2.9;
const SHAKE_INTENSITY_MUL = 1.5;

/** Distance-weighted explosion camera shake for the local player. */
export class ExplosionCameraShake {
  private trauma = 0;
  private time = 0;
  private pitch = 0;
  private yaw = 0;
  private roll = 0;

  trigger(
    explosionX: number,
    explosionY: number,
    explosionZ: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    blastRadius = GRENADE_BLAST_RADIUS,
  ): void {
    const dx = explosionX - playerX;
    const dy = explosionY - playerY;
    const dz = explosionZ - playerZ;
    const dist = Math.hypot(dx, dy, dz);
    const maxDist = blastRadius * MAX_SHAKE_DISTANCE_MUL;
    if (dist >= maxDist) return;

    const falloff = 1 - dist / maxDist;
    const added = falloff * falloff * 1.25 * SHAKE_INTENSITY_MUL;
    this.trauma = Math.min(1, Math.max(this.trauma, added));
  }

  update(delta: number): void {
    if (this.trauma <= 0.001) {
      this.trauma = 0;
      this.pitch = 0;
      this.yaw = 0;
      this.roll = 0;
      return;
    }

    this.time += delta;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * delta);

    const amp = this.trauma * this.trauma;
    this.pitch =
      Math.sin(this.time * 52) * amp * 0.72 +
      Math.sin(this.time * 29) * amp * 0.33;
    this.yaw =
      Math.cos(this.time * 47) * amp * 0.66 +
      Math.sin(this.time * 33) * amp * 0.27;
    this.roll = Math.sin(this.time * 39) * amp * 0.3;
  }

  reset(): void {
    this.trauma = 0;
    this.time = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;
  }

  isActive(): boolean {
    return this.trauma > 0.001;
  }

  applyAdditive(yawRig: THREE.Object3D, pitchRig: THREE.Object3D): void {
    yawRig.rotation.y += this.yaw;
    yawRig.rotation.z += this.roll;
    pitchRig.rotation.x += this.pitch;
  }
}
