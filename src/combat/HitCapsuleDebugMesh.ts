import * as THREE from 'three';
import {
  PLAYER_HIT_CAPSULE_HEIGHT,
  PLAYER_HIT_CAPSULE_RADIUS,
} from '../../shared/combat/playerHitbox';

/** Toggle translucent hit-capsule meshes on remote players. */
export const SHOW_HIT_CAPSULE_DEBUG = false;

export function isHitCapsuleDebugEnabled(): boolean {
  return SHOW_HIT_CAPSULE_DEBUG;
}

export function createHitCapsuleDebugMesh(): THREE.Group {
  const radius = PLAYER_HIT_CAPSULE_RADIUS;
  const cylLength = Math.max(0, PLAYER_HIT_CAPSULE_HEIGHT - radius * 2);
  const geometry = new THREE.CapsuleGeometry(radius, cylLength, 6, 16);

  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x3dff9a,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: 0x9dffd0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  const group = new THREE.Group();
  group.name = 'hit-capsule-debug';
  group.position.y = PLAYER_HIT_CAPSULE_HEIGHT * 0.5;
  group.add(fill);
  group.add(outline);
  group.renderOrder = 10;
  return group;
}
