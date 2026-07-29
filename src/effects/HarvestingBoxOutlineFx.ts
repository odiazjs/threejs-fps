import type * as THREE from 'three';

/**
 * Registers harvesting-box roots for dedicated blue / orange OutlinePasses.
 */
const blueRoots = new Set<THREE.Object3D>();
const orangeRoots = new Set<THREE.Object3D>();

export class HarvestingBoxOutlineFx {
  static attach(root: THREE.Object3D, teamId: number): void {
    HarvestingBoxOutlineFx.detach(root);
    if (teamId === 1) {
      orangeRoots.add(root);
    } else {
      blueRoots.add(root);
    }
  }

  static detach(root: THREE.Object3D): void {
    blueRoots.delete(root);
    orangeRoots.delete(root);
  }

  static clear(): void {
    blueRoots.clear();
    orangeRoots.clear();
  }

  static getBlueRoots(): THREE.Object3D[] {
    return [...blueRoots];
  }

  static getOrangeRoots(): THREE.Object3D[] {
    return [...orangeRoots];
  }
}
