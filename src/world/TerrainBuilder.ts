import * as THREE from 'three';
import { FLOOR_SIZE } from '../../shared/level/kiloSectorColliders';

export class TerrainBuilder {
  private readonly group = new THREE.Group();
  private readonly ground: THREE.Mesh;

  constructor() {
    const groundGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
    groundGeo.rotateX(-Math.PI / 2);

    this.ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshLambertMaterial({ color: 0x48b440 }),
    );
    this.ground.receiveShadow = false;
    this.ground.castShadow = false;
    this.group.add(this.ground);
  }

  build(): THREE.Group {
    return this.group;
  }

  dispose(): void {
    this.ground.geometry.dispose();
    const { material } = this.ground;
    if (material instanceof THREE.Material) material.dispose();
  }
}
