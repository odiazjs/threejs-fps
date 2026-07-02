import * as THREE from 'three';
import { MAP_PALETTE } from './mapPalette.js';
import { createFlatKitMesh } from '../visuals/edgeLines.js';
import {
  CONTAINERS,
  COVER_WALLS,
  CRATE_STACKS,
  ENERGY_BARRIERS,
  KILLHOUSE_DEPTH,
  KILLHOUSE_WIDTH,
  LAB_PROPS,
  LAB_SHELLS,
  MAP_HALF_X,
  MAP_HALF_Z,
  PERIMETER_WALLS,
  PLATFORMS,
  ROVERS,
  STAIRS,
  VIEWPORT_WALLS,
  type BoxProp,
} from './killhouseSmallColliders.js';

const mapGroup = new THREE.Group();
mapGroup.name = 'killhouse_small';

const BIO_MAGENTA = 0xff4fd8;
const FLOOR_TILE = 0x8a9098;
const CONTAINER_DARK = 0x2a2f36;

function createStyledMesh(geometry: THREE.BufferGeometry, color: number): THREE.Group {
  return createFlatKitMesh(geometry, color);
}

function addPropBox(
  parent: THREE.Object3D,
  prop: BoxProp,
  color: number,
  y = 0,
): void {
  const mesh = createStyledMesh(new THREE.BoxGeometry(prop.w, prop.h, prop.d), color);
  const baseY = prop.minY ?? y;
  mesh.position.set(prop.x, baseY + prop.h / 2, prop.z);
  mesh.rotation.y = prop.rotY ?? 0;
  parent.add(mesh);
}

function addProps(parent: THREE.Object3D, props: readonly BoxProp[], color: number): void {
  for (const prop of props) {
    addPropBox(parent, prop, color);
  }
}

function createFloor(): void {
  const floor = createStyledMesh(
    new THREE.BoxGeometry(KILLHOUSE_WIDTH, 0.12, KILLHOUSE_DEPTH),
    FLOOR_TILE,
  );
  floor.position.y = -0.06;
  mapGroup.add(floor);

  const tileStep = 2;
  for (let x = -MAP_HALF_X + tileStep / 2; x < MAP_HALF_X; x += tileStep) {
    for (let z = -MAP_HALF_Z + tileStep / 2; z < MAP_HALF_Z; z += tileStep) {
      if ((Math.abs(Math.round(x)) + Math.abs(Math.round(z))) % 4 === 0) continue;
      const tile = createStyledMesh(new THREE.BoxGeometry(1.92, 0.02, 1.92), MAP_PALETTE.carbonGrey);
      tile.position.set(x, 0.02, z);
      mapGroup.add(tile);
    }
  }
}

function createConduits(): void {
  const segments: Array<{ x: number; z: number; w: number; d: number }> = [
    { x: -18, z: -6, w: 14, d: 0.14 },
    { x: -4, z: -6, w: 0.14, d: 10 },
    { x: 6, z: 2, w: 18, d: 0.14 },
    { x: 14, z: -4, w: 0.14, d: 12 },
    { x: -10, z: 8, w: 10, d: 0.14 },
    { x: 0, z: 0, w: 0.14, d: 8 },
  ];

  for (const seg of segments) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(seg.w, 0.04, seg.d),
      new THREE.MeshBasicMaterial({
        color: MAP_PALETTE.neonCyan,
        transparent: true,
        opacity: 0.85,
      }),
    );
    line.position.set(seg.x, 0.05, seg.z);
    mapGroup.add(line);
  }

  const padPositions = [
    { x: -18, z: -6 },
    { x: 6, z: 2 },
    { x: 14, z: -4 },
    { x: -4, z: 8 },
    { x: 2, z: -2 },
  ];
  for (const { x, z } of padPositions) {
    const pad = createStyledMesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 16), MAP_PALETTE.steelGrey);
    pad.position.set(x, 0.04, z);
    mapGroup.add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: MAP_PALETTE.neonCyan }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.08, z);
    mapGroup.add(ring);
  }
}

function createContainers(): void {
  for (const container of CONTAINERS) {
    addPropBox(mapGroup, container, CONTAINER_DARK);
    const stripe = createStyledMesh(
      new THREE.BoxGeometry(container.w * 0.92, 0.12, container.d * 0.92),
      MAP_PALETTE.pastelOrange,
    );
    stripe.position.set(container.x, container.h * 0.55, container.z);
    stripe.rotation.y = container.rotY ?? 0;
    mapGroup.add(stripe);
  }
}

function createEnergyBarriers(): void {
  for (const barrier of ENERGY_BARRIERS) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(barrier.w, barrier.h, barrier.d),
      new THREE.MeshBasicMaterial({
        color: MAP_PALETTE.neonCyan,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    panel.position.set(barrier.x, barrier.h / 2, barrier.z);
    mapGroup.add(panel);
  }
}

function createBioPatches(): void {
  const patches = [
    { x: -23, z: -14, count: 6 },
    { x: 23, z: -13, count: 5 },
    { x: -23, z: 13, count: 4 },
    { x: 22, z: 14, count: 5 },
    { x: -12, z: 13, count: 3 },
    { x: 10, z: -13, count: 4 },
  ];

  for (const patch of patches) {
    for (let i = 0; i < patch.count; i++) {
      const angle = (i / patch.count) * Math.PI * 2;
      const radius = 0.35 + (i % 3) * 0.22;
      const blob = createStyledMesh(
        new THREE.SphereGeometry(0.28 + (i % 2) * 0.08, 8, 6),
        i % 2 === 0 ? BIO_MAGENTA : MAP_PALETTE.pastelRose,
      );
      blob.position.set(
        patch.x + Math.cos(angle) * radius,
        0.2 + (i % 3) * 0.08,
        patch.z + Math.sin(angle) * radius,
      );
      blob.scale.set(1, 0.55 + (i % 2) * 0.2, 1);
      mapGroup.add(blob);
    }
  }
}

function createLabDeck(originX: number, originZ: number): void {
  const platform = PLATFORMS.find((entry) => entry.x === originX && entry.surfaceY > 2);
  if (!platform) return;

  const deck = createStyledMesh(
    new THREE.BoxGeometry(platform.w, 0.28, platform.d),
    MAP_PALETTE.steelGrey,
  );
  deck.position.set(platform.x, platform.surfaceY - 0.14, platform.z);
  mapGroup.add(deck);

  const accent = MAP_PALETTE.neonCyan;
  const railH = 1.05;
  const railY = platform.surfaceY + railH / 2;
  const halfW = platform.w / 2 - 0.2;
  const halfD = platform.d / 2 - 0.2;
  const railOffsets = [
    { x: 0, z: -halfD, w: platform.w, d: 0.08 },
    { x: -halfW, z: 0, w: 0.08, d: platform.d },
    { x: halfW, z: 0, w: 0.08, d: platform.d },
  ];
  for (const rail of railOffsets) {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(rail.w, railH, rail.d),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    barrier.position.set(platform.x + rail.x, railY, platform.z + rail.z);
    mapGroup.add(barrier);
  }

  const core = createStyledMesh(new THREE.CylinderGeometry(0.55, 0.7, 1.6, 10), accent);
  core.position.set(originX, 0.8, originZ);
  mapGroup.add(core);
}

function createRover(prop: BoxProp): void {
  const rover = new THREE.Group();
  rover.position.set(prop.x, 0, prop.z);
  rover.rotation.y = prop.rotY ?? 0;

  const body = createStyledMesh(new THREE.BoxGeometry(1.6, 0.55, 2.4), MAP_PALETTE.steelGrey);
  body.position.y = 0.42;
  rover.add(body);

  const cabin = createStyledMesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), MAP_PALETTE.carbonGrey);
  cabin.position.set(0, 0.82, -0.2);
  rover.add(cabin);

  for (const wx of [-0.55, 0.55]) {
    for (const wz of [-0.75, 0.75]) {
      const wheel = createStyledMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10), MAP_PALETTE.darkGunmetal);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.22, wz);
      rover.add(wheel);
    }
  }

  mapGroup.add(rover);
}

function createSpawnMarkers(): void {
  const markers = [
    { x: -20, z: -12, color: 0x4da3ff },
    { x: 20, z: 12, color: 0xff5a5a },
  ] as const;

  for (const marker of markers) {
    const pad = createStyledMesh(new THREE.CylinderGeometry(1.1, 1.1, 0.05, 20), marker.color);
    pad.position.set(marker.x, 0.06, marker.z);
    mapGroup.add(pad);
  }
}

createFloor();
createConduits();
addProps(mapGroup, PERIMETER_WALLS, MAP_PALETTE.steelGrey);
addProps(mapGroup, VIEWPORT_WALLS, MAP_PALETTE.carbonGrey);
addProps(mapGroup, LAB_SHELLS, MAP_PALETTE.carbonGrey);
addProps(mapGroup, STAIRS, MAP_PALETTE.ironGrey);
addProps(mapGroup, COVER_WALLS, MAP_PALETTE.darkGunmetal);
addProps(mapGroup, CRATE_STACKS, MAP_PALETTE.ironGrey);
addProps(mapGroup, LAB_PROPS, MAP_PALETTE.darkGunmetal);
createContainers();
createEnergyBarriers();
createBioPatches();
createLabDeck(-16, 4);
createLabDeck(14, -1);
for (const rover of ROVERS) {
  createRover(rover);
}
createSpawnMarkers();

export { mapGroup };
