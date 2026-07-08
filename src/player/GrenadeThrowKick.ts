import * as THREE from 'three';

const RECOVERY_SPEED = 9;

/** Stronger camera kick when releasing a grenade. */
export class GrenadeThrowKick {
  private pitch = 0;
  private yaw = 0;
  private roll = 0;

  trigger(): void {
    this.pitch = 0.17;
    this.yaw = (Math.random() - 0.5) * 0.11;
    this.roll = (Math.random() - 0.5) * 0.06;
  }

  update(delta: number): void {
    const decay = 1 - Math.exp(-RECOVERY_SPEED * delta);
    this.pitch *= 1 - decay;
    this.yaw *= 1 - decay;
    this.roll *= 1 - decay;

    if (Math.abs(this.pitch) < 1e-5) this.pitch = 0;
    if (Math.abs(this.yaw) < 1e-5) this.yaw = 0;
    if (Math.abs(this.roll) < 1e-5) this.roll = 0;
  }

  reset(): void {
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;
  }

  isActive(): boolean {
    return this.pitch !== 0 || this.yaw !== 0 || this.roll !== 0;
  }

  applyAdditive(yawRig: THREE.Object3D, pitchRig: THREE.Object3D): void {
    yawRig.rotation.y += this.yaw;
    yawRig.rotation.z += this.roll;
    pitchRig.rotation.x += this.pitch;
  }
}
