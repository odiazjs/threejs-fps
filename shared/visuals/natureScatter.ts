import * as THREE from 'three';
import { MAP_HALF } from '../level/kiloSectorColliders.js';
import { MAP_PALETTE } from '../level/mapPalette.js';
import { createPBRMesh } from './pbrMesh.js';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createTree(): THREE.Group {
  const tree = new THREE.Group();
  const trunk = createPBRMesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6),
    { color: MAP_PALETTE.bark, roughness: 0.95, metalness: 0 },
  );
  trunk.position.y = 0.7;
  tree.add(trunk);

  const foliage = createPBRMesh(
    new THREE.ConeGeometry(0.85, 2.2, 7),
    { color: MAP_PALETTE.foliage, roughness: 0.88, metalness: 0 },
  );
  foliage.position.y = 2.1;
  tree.add(foliage);

  const foliage2 = createPBRMesh(
    new THREE.ConeGeometry(0.65, 1.6, 7),
    { color: MAP_PALETTE.moss, roughness: 0.88, metalness: 0 },
  );
  foliage2.position.y = 2.9;
  tree.add(foliage2);

  return tree;
}

function createRock(rand: () => number): THREE.Mesh {
  const mesh = createPBRMesh(
    new THREE.DodecahedronGeometry(0.55 + rand() * 0.35, 0),
    { color: MAP_PALETTE.stone, roughness: 0.92, metalness: 0.05 },
  );
  mesh.scale.set(
    0.8 + rand() * 0.6,
    0.5 + rand() * 0.5,
    0.8 + rand() * 0.6,
  );
  mesh.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.3);
  return mesh;
}

export function createNatureScatter(): THREE.Group {
  const group = new THREE.Group();
  const rand = seededRandom(99);
  const edge = MAP_HALF - 4;

  for (let i = 0; i < 28; i++) {
    const tree = createTree();
    const side = i % 4;
    const along = (rand() * 2 - 1) * (edge - 6);
    const inset = 2 + rand() * 5;

    if (side === 0) tree.position.set(along, 0, -edge + inset);
    else if (side === 1) tree.position.set(along, 0, edge - inset);
    else if (side === 2) tree.position.set(-edge + inset, 0, along);
    else tree.position.set(edge - inset, 0, along);

    tree.rotation.y = rand() * Math.PI * 2;
    tree.scale.setScalar(0.85 + rand() * 0.5);
    group.add(tree);
  }

  for (let i = 0; i < 40; i++) {
    const rock = createRock(rand);
    const x = (rand() * 2 - 1) * (edge - 8);
    const z = (rand() * 2 - 1) * (edge - 8);
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
    rock.position.set(x, 0.15, z);
    group.add(rock);
  }

  return group;
}
