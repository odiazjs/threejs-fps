import * as THREE from 'three';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { addEdgeLines } from '../visuals/edgeLines';
import { createToonMaterial } from '../visuals/toonMaterial';

const TORSO_WIDTH = 0.46;
const TORSO_HEIGHT = 1.05;
const TORSO_DEPTH = 0.32;
const HEAD_SIZE = 0.28;

/** Vertical pivot for remote look pitch — eye line on the avatar. */
export const REMOTE_AIM_HEIGHT = EYE_HEIGHT - 0.06;
export { HEAD_SIZE };

export function createRemoteTorso(color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH),
    createToonMaterial(color),
  );
  mesh.position.y = TORSO_HEIGHT / 2;
  addEdgeLines(mesh);
  return mesh;
}

/** Head with a front face marker; forward is -Z. */
export function createRemoteHead(color: number): THREE.Group {
  const head = new THREE.Group();

  const skull = new THREE.Mesh(
    new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE),
    createToonMaterial(color),
  );
  addEdgeLines(skull);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(HEAD_SIZE * 0.55, HEAD_SIZE * 0.32, 0.02),
    createToonMaterial(0xe8eef5),
  );
  face.position.z = -HEAD_SIZE / 2 - 0.01;

  head.add(skull);
  head.add(face);
  return head;
}
