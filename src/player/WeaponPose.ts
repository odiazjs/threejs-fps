import * as THREE from 'three';

const HIP_OFFSET = new THREE.Vector3(0.15, -0.18, -0.35);
const ADS_OFFSET = new THREE.Vector3(0, -0.14, -0.30);
const BLEND_SPEED = 30;

export { HIP_OFFSET as WEAPON_HIP_OFFSET };

const _offset = new THREE.Vector3();

/** Blends the local weapon between hip-fire and centered ADS poses. */
export class WeaponPose {
  private blend = 0;

  get hipOffset(): THREE.Vector3 {
    return HIP_OFFSET;
  }

  reset(): void {
    this.blend = 0;
  }

  update(delta: number, ads: boolean): void {
    const target = ads ? 1 : 0;
    this.blend += (target - this.blend) * (1 - Math.exp(-BLEND_SPEED * delta));
  }

  apply(weapon: THREE.Object3D): void {
    _offset.lerpVectors(HIP_OFFSET, ADS_OFFSET, this.blend);
    weapon.position.copy(_offset);
  }
}
