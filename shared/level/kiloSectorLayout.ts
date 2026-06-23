import * as THREE from 'three';
import { MAP_PALETTE } from './mapPalette.js';
import {
  BOUNDARY_WALL,
  COLUMN_POSITIONS,
  FLOOR_SIZE,
} from './kiloSectorColliders.js';

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

const floor = createStyledMesh(
  new THREE.BoxGeometry(FLOOR_SIZE, 0.2, FLOOR_SIZE),
  MAP_PALETTE.carbonGrey,
);
floor.position.y = -0.1;
mapGroup.add(floor);

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

function createBoundarySegment(width: number, depth: number): THREE.Group {
  const wall = new THREE.Group();
  const { height, floorGap } = BOUNDARY_WALL;

  const sillHeight = 0.28;
  const sillY = floorGap + sillHeight / 2;

  const sill = createStyledMesh(
    new THREE.BoxGeometry(width, sillHeight, depth),
    MAP_PALETTE.darkGunmetal,
  );
  sill.position.y = sillY;
  wall.add(sill);

  const bodyHeight = height - sillHeight - 0.35;
  const bodyY = floorGap + sillHeight + bodyHeight / 2;

  const body = createStyledMesh(
    new THREE.BoxGeometry(width - 0.12, bodyHeight, depth),
    MAP_PALETTE.ironGrey,
  );
  body.position.y = bodyY;
  wall.add(body);

  const panel = createStyledMesh(
    new THREE.BoxGeometry(width - 0.35, bodyHeight - 0.55, depth * 0.18),
    MAP_PALETTE.pastelOrange,
  );
  panel.position.y = bodyY;
  wall.add(panel);

  const trim = createStyledMesh(
    new THREE.BoxGeometry(width, 0.18, depth),
    MAP_PALETTE.pastelTeal,
  );
  trim.position.y = floorGap + height - 0.12;
  wall.add(trim);

  const plasmaStrip = createStyledMesh(
    new THREE.BoxGeometry(width - 0.8, 0.12, depth * 0.22),
    MAP_PALETTE.pastelTeal,
  );
  plasmaStrip.position.y = floorGap + height * 0.62;
  wall.add(plasmaStrip);

  return wall;
}

for (const { x, z } of COLUMN_POSITIONS) {
  const column = createColumn();
  column.position.set(x, 0, z);
  mapGroup.add(column);
}

const { thickness, span, offset } = BOUNDARY_WALL;

const northWall = createBoundarySegment(span, thickness);
northWall.position.set(0, 0, -offset);
mapGroup.add(northWall);

const southWall = createBoundarySegment(span, thickness);
southWall.position.set(0, 0, offset);
mapGroup.add(southWall);

const westWall = createBoundarySegment(thickness, span);
westWall.position.set(-offset, 0, 0);
mapGroup.add(westWall);

const eastWall = createBoundarySegment(thickness, span);
eastWall.position.set(offset, 0, 0);
mapGroup.add(eastWall);

export { mapGroup };
