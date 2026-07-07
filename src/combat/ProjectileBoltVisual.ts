import * as THREE from 'three';
import {
  getBoltCoreGeometry,
  getBoltCoreMaterial,
  getBoltGlowGeometry,
  getBoltGlowMaterial,
} from './boltVisualShared';

const FORWARD = new THREE.Vector3(0, 0, -1);

export interface ProjectileBoltVisualOptions {
  colors?: readonly [number, number, number];
}

/**
 * Lightweight plasma bolt — reuses shared geometry/materials (no per-shot GPU alloc).
 */
export class ProjectileBoltVisual {
  readonly object = new THREE.Group();

  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;

  constructor(_options: ProjectileBoltVisualOptions = {}) {
    this.core = new THREE.Mesh(getBoltCoreGeometry(), getBoltCoreMaterial());
    this.core.rotation.x = Math.PI / 2;
    this.object.add(this.core);

    this.glow = new THREE.Mesh(getBoltGlowGeometry(), getBoltGlowMaterial());
    this.object.add(this.glow);
  }

  setPose(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.object.position.copy(position);
    this.object.quaternion.setFromUnitVectors(FORWARD, direction);
  }

  tick(_delta: number): void {
    // Static bolt — no per-frame material/scale work.
  }

  dispose(): void {
    this.object.removeFromParent();
  }
}
