import * as THREE from 'three';
import { MAP_PALETTE } from './mapPalette.js';
import { COLUMN_POSITIONS } from './kiloSectorColliders.js';

const mapGroup = new THREE.Group();

function createStyledMesh(geometry: THREE.BufferGeometry, color: number): THREE.Group {
  const group = new THREE.Group();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
  group.add(line);

  return group;
}

function createColumn(): THREE.Group {
  const column = new THREE.Group();

  const base = createStyledMesh(
    new THREE.BoxGeometry(1.5, 0.28, 1.5),
    MAP_PALETTE.darkGunmetal,
  );
  base.position.y = 0.14;
  column.add(base);

  const shaft = createStyledMesh(
    new THREE.BoxGeometry(1.1, 2.1, 1.1),
    MAP_PALETTE.ironGrey,
  );
  shaft.position.y = 1.31;
  column.add(shaft);

  const panelGeo = new THREE.BoxGeometry(0.92, 1.35, 0.07);
  const panelY = 1.35;
  const panelInset = 0.58;

  for (const { x, z } of [
    { x: 0, z: -panelInset },
    { x: 0, z: panelInset },
    { x: -panelInset, z: 0 },
    { x: panelInset, z: 0 },
  ]) {
    const panel = createStyledMesh(panelGeo, MAP_PALETTE.pastelOrange);
    panel.position.set(x, panelY, z);
    column.add(panel);
  }

  const trimBand = createStyledMesh(
    new THREE.BoxGeometry(1.22, 0.12, 1.22),
    MAP_PALETTE.steelGrey,
  );
  trimBand.position.y = 0.62;
  column.add(trimBand);

  const plasmaBand = createStyledMesh(
    new THREE.BoxGeometry(1.28, 0.22, 1.28),
    MAP_PALETTE.pastelTeal,
  );
  plasmaBand.position.y = 2.05;
  column.add(plasmaBand);

  const cap = createStyledMesh(
    new THREE.BoxGeometry(1.38, 0.32, 1.38),
    MAP_PALETTE.steelGrey,
  );
  cap.position.y = 2.84;
  column.add(cap);

  const capCore = createStyledMesh(
    new THREE.BoxGeometry(0.55, 0.14, 0.55),
    MAP_PALETTE.pastelTeal,
  );
  capCore.position.y = 3.07;
  column.add(capCore);

  return column;
}

for (const { x, z } of COLUMN_POSITIONS) {
  const column = createColumn();
  column.position.set(x, 0, z);
  mapGroup.add(column);
}

export { mapGroup };
