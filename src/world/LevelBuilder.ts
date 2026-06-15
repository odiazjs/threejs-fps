import * as THREE from 'three';
import { BOX_CENTER_Y, BOX_PLACEMENTS, BOX_SIZE } from '../../shared/level/levelData';
import { FLOOR, OBJECT } from '../content/theme';
import { addEdgeLines } from '../visuals/edgeLines';
import { createToonMaterial } from '../visuals/toonMaterial';

export class LevelBuilder {
  build(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      createToonMaterial(FLOOR),
    );
    floor.rotation.x = -Math.PI / 2;
    objects.push(floor);

    const boxGeo = new THREE.BoxGeometry(BOX_SIZE.width, BOX_SIZE.height, BOX_SIZE.depth);
    const boxMat = createToonMaterial(OBJECT);
    for (const [x, z] of BOX_PLACEMENTS) {
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(x, BOX_CENTER_Y, z);
      addEdgeLines(box);
      objects.push(box);
    }

    return objects;
  }
}
