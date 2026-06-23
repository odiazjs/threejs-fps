import * as THREE from 'three';
import { raycastLevel } from '../../shared/level/collision';
import {
  PROJECTILE_MAX_AGE,
  PROJECTILE_MOVE_STEP,
  PROJECTILE_RAY_SKIN,
} from './projectileConfig';

const PROJECTILE_COLOR = 0x00f0ff;
const FORWARD = new THREE.Vector3(0, 0, -1);

export type ProjectileHit = {
  point: THREE.Vector3;
};

export type ProjectileUpdateResult =
  | { alive: true }
  | { alive: false; hit?: ProjectileHit };

export class Projectile {
  readonly object = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.2),
    new THREE.MeshBasicMaterial({ color: PROJECTILE_COLOR }),
  );

  private readonly velocity = new THREE.Vector3();
  private age = 0;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, speed: number) {
    this.object.position.copy(origin);
    this.object.quaternion.setFromUnitVectors(FORWARD, direction);
    this.velocity.copy(direction).multiplyScalar(speed);
  }

  update(delta: number): ProjectileUpdateResult {
    this.age += delta;
    if (this.age >= PROJECTILE_MAX_AGE) {
      return { alive: false };
    }

    const speed = this.velocity.length();
    if (speed <= 0) {
      return { alive: true };
    }

    const dirX = this.velocity.x / speed;
    const dirY = this.velocity.y / speed;
    const dirZ = this.velocity.z / speed;
    const pos = this.object.position;

    let remaining = speed * delta;

    while (remaining > 0) {
      const step = Math.min(remaining, PROJECTILE_MOVE_STEP);
      const skin = Math.min(PROJECTILE_RAY_SKIN, step * 0.5);

      const hit = raycastLevel(
        pos.x + dirX * skin,
        pos.y + dirY * skin,
        pos.z + dirZ * skin,
        dirX,
        dirY,
        dirZ,
        step,
      );

      if (hit) {
        pos.set(hit.x, hit.y, hit.z);
        return { alive: false, hit: { point: pos.clone() } };
      }

      pos.x += dirX * step;
      pos.y += dirY * step;
      pos.z += dirZ * step;
      remaining -= step;
    }

    return { alive: true };
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
