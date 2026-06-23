import * as THREE from 'three';
import { HIT_SPLASH_DURATION } from './projectileConfig';

const SPLASH_COLOR = 0x00f0ff;
const SPARK_COUNT = 5;

export class HitSplash {
  readonly object = new THREE.Group();

  private age = 0;
  private readonly parts: THREE.Mesh[] = [];
  private readonly velocities: THREE.Vector3[] = [];

  constructor(point: THREE.Vector3) {
    this.object.position.copy(point);

    const core = this.createPart(0.14);
    this.object.add(core);
    this.parts.push(core);
    this.velocities.push(new THREE.Vector3());

    for (let i = 0; i < SPARK_COUNT; i++) {
      const spark = this.createPart(0.07);
      const velocity = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      )
        .normalize()
        .multiplyScalar(1.5 + Math.random() * 2);

      this.object.add(spark);
      this.parts.push(spark);
      this.velocities.push(velocity);
    }
  }

  /** @returns false when the effect is finished */
  update(delta: number): boolean {
    this.age += delta;
    const t = this.age / HIT_SPLASH_DURATION;
    const fade = 1 - t;

    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      part.position.addScaledVector(this.velocities[i], delta);
      part.scale.setScalar(Math.max(0.05, fade));
    }

    return this.age < HIT_SPLASH_DURATION;
  }

  dispose(): void {
    for (const part of this.parts) {
      part.geometry.dispose();
      (part.material as THREE.Material).dispose();
    }
    this.object.removeFromParent();
  }

  private createPart(size: number): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color: SPLASH_COLOR }),
    );
  }
}
