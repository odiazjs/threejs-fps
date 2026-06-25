import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines.js';

export const AMMO_BOX_SIZE = { radius: 0.15, height: 1 };

function createStyledMesh(
  geometry: THREE.BufferGeometry,
  color: number,
): THREE.Group {
  return createFlatKitMesh(geometry, color);
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
