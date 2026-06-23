import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';

export const AMMO_BOX_SIZE = { radius: 0.15, height: 1 };

function createStyledMesh(
  geometry: THREE.BufferGeometry,
  color: number,
): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color }),
  );
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x000000 }),
  );
  group.add(line);

  return group;
}

export function createAmmoBox(): THREE.Group {
  const { radius, height } = AMMO_BOX_SIZE;
  const group = createStyledMesh(
    new THREE.CylinderGeometry(radius, radius, height, 16),
    MAP_PALETTE.pastelTeal,
  );
  group.position.y = height / 2;
  return group;
}
