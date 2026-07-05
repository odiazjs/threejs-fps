import * as THREE from 'three';
import type { Aabb } from '../../shared/level/levelData';
import { getKillhouseServerColliders } from '../../shared/level/killhouseServerColliders';
import { SHOW_SERVER_PROXY_COLLIDER_DEBUG } from './debugConfig';

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

/** Orange module boxes — server anti-cheat proxies (coarse, not mesh-accurate). */
export function attachKillhouseServerProxyDebug(parent: THREE.Object3D): THREE.Group | null {
  if (!SHOW_SERVER_PROXY_COLLIDER_DEBUG) return null;

  const boxes = getKillhouseServerColliders();
  const group = new THREE.Group();
  group.name = 'server-proxy-collider-debug';
  group.renderOrder = 9999;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, boxes.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9999;

  for (let i = 0; i < boxes.length; i++) {
    mesh.setMatrixAt(i, aabbToMatrix(boxes[i]!));
  }
  mesh.instanceMatrix.needsUpdate = true;

  group.add(mesh);
  parent.add(group);

  console.info(`[ServerProxyDebug] Attached ${boxes.length} coarse server module boxes (orange wireframe)`);
  return group;
}

function aabbToMatrix(box: Aabb): THREE.Matrix4 {
  _position.set(
    (box.minX + box.maxX) * 0.5,
    (box.minY + box.maxY) * 0.5,
    (box.minZ + box.maxZ) * 0.5,
  );
  _scale.set(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
  _matrix.compose(_position, _quaternion, _scale);
  return _matrix;
}
