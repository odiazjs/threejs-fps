import * as THREE from 'three';
import { FLOOR, OBJECT } from '../content/theme';
import { addEdgeLines } from '../visuals/edgeLines';
import { createToonMaterial } from '../visuals/toonMaterial';

const BOX_PLACEMENTS = [[5, -10], [-8, -5], [0, -15], [12, 5]] as const;
export class LevelBuilder {
  build(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      createToonMaterial(FLOOR),
    );
    floor.rotation.x = -Math.PI / 2;
    objects.push(floor);

    const boxGeo = new THREE.BoxGeometry(2, 4, 2);
    const boxMat = createToonMaterial(OBJECT);
    for (const [x, z] of BOX_PLACEMENTS) {
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(x, 2, z);
      addEdgeLines(box);
      objects.push(box);
    }

    return objects;
  }
}
