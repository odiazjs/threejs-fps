import * as THREE from 'three';
import { createFlatKitMesh } from '../visuals/edgeLines.js';
import {
  KILLHOUSE_DEPTH,
  KILLHOUSE_WIDTH,
} from './killhouseSmallColliders.js';

const mapGroup = new THREE.Group();
mapGroup.name = 'killhouse_small';

const FLOOR_TILE = 0x8a9098;

function createStyledMesh(geometry: THREE.BufferGeometry, color: number): THREE.Group {
  return createFlatKitMesh(geometry, color);
}

const floor = createStyledMesh(
  new THREE.BoxGeometry(KILLHOUSE_WIDTH, 0.12, KILLHOUSE_DEPTH),
  FLOOR_TILE,
);
floor.position.y = -0.06;
floor.traverse((child) => {
  if (child instanceof THREE.Mesh) {
    child.userData.skipCollision = true;
  }
});
mapGroup.add(floor);

export { mapGroup };
