import * as THREE from 'three';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines.js';

const colors = {
  body: 0x4d533c,
  panel: 0x944b47,
  plasma: 0x00f0ff,
  grip: 0x3b3f2e,
};

const WEAPON_EDGE_OPTIONS = {
  thresholdAngle: 32,
  lineWidth: 0.82,
};

function createPart(geometry: THREE.BufferGeometry, color: number): THREE.Group {
  return createFlatKitMesh(geometry, color, WEAPON_EDGE_OPTIONS);
}

export function createPlasmaRifle(): THREE.Group {
  const weaponGroup = new THREE.Group();

  const lowerBody = createPart(new THREE.BoxGeometry(2.5, 0.6, 0.6), colors.body);
  lowerBody.position.set(-0.5, 0, 0);
  weaponGroup.add(lowerBody);

  const upperPanel = createPart(new THREE.BoxGeometry(2.2, 0.7, 0.7), colors.panel);
  upperPanel.position.set(-0.6, 0.5, 0);
  weaponGroup.add(upperPanel);

  const stockCap = createPart(new THREE.BoxGeometry(0.2, 1.2, 0.65), colors.body);
  stockCap.position.set(-1.8, 0.25, 0);
  weaponGroup.add(stockCap);

  const bridge = createPart(new THREE.BoxGeometry(1.0, 0.2, 0.4), colors.body);
  bridge.position.set(-1.1, -0.4, 0);
  bridge.rotation.z = 0.5;
  weaponGroup.add(bridge);

  const grip = createPart(new THREE.BoxGeometry(0.3, 0.8, 0.4), colors.grip);
  grip.position.set(-0.4, -0.6, 0);
  grip.rotation.z = -0.2;
  weaponGroup.add(grip);

  const scopeBase = createPart(new THREE.BoxGeometry(0.8, 0.3, 0.4), colors.body);
  scopeBase.position.set(0.4, 0.9, 0);
  weaponGroup.add(scopeBase);

  const scopeAim = createPart(new THREE.BoxGeometry(0.4, 0.3, 0.3), colors.body);
  scopeAim.position.set(0.2, 1.1, 0);
  weaponGroup.add(scopeAim);

  for (let i = 0; i < 3; i++) {
    const cap = createPart(new THREE.BoxGeometry(0.2, 0.15, 0.4), colors.plasma);
    cap.position.set(-0.3 - i * 0.28, 0.9, 0);
    weaponGroup.add(cap);
  }

  const coreHub = createPart(new THREE.BoxGeometry(0.4, 0.5, 0.5), colors.plasma);
  coreHub.position.set(0.8, 0.3, 0);
  weaponGroup.add(coreHub);

  const segmentCount = 5;
  const segmentLength = 0.35;
  const spacing = 0.4;

  for (let i = 0; i < segmentCount; i++) {
    const xPos = 1.3 + i * spacing;

    const topSeg = createPart(new THREE.BoxGeometry(segmentLength, 0.3, 0.6), colors.body);
    topSeg.position.set(xPos, 0.65, 0);
    weaponGroup.add(topSeg);

    const topPlate = createPart(new THREE.BoxGeometry(segmentLength - 0.05, 0.1, 0.64), colors.panel);
    topPlate.position.set(xPos, 0.8, 0);
    weaponGroup.add(topPlate);

    const botSeg = createPart(new THREE.BoxGeometry(segmentLength, 0.3, 0.6), colors.body);
    botSeg.position.set(xPos, -0.05, 0);
    weaponGroup.add(botSeg);

    const botPlate = createPart(new THREE.BoxGeometry(segmentLength - 0.05, 0.1, 0.64), colors.panel);
    botPlate.position.set(xPos, -0.2, 0);
    weaponGroup.add(botPlate);
  }

  const plasmaBeam = createPart(new THREE.BoxGeometry(2.0, 0.1, 0.2), colors.plasma);
  const plasmaBeamLength = 2.0;
  plasmaBeam.position.set(2.0, 0.3, 0);
  weaponGroup.add(plasmaBeam);

  const foregrip = createPart(new THREE.BoxGeometry(0.25, 0.6, 0.3), colors.grip);
  foregrip.position.set(1.8, -0.45, 0);
  foregrip.rotation.z = -0.3;
  weaponGroup.add(foregrip);

  const lastSegmentCenterX = 1.3 + (segmentCount - 1) * spacing;
  const barrelTipX = Math.max(
    plasmaBeam.position.x + plasmaBeamLength / 2,
    lastSegmentCenterX + segmentLength / 2,
  );

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(barrelTipX, plasmaBeam.position.y, 0);
  weaponGroup.add(muzzle);
  weaponGroup.userData.weaponMuzzle = muzzle;

  weaponGroup.scale.set(0.1, 0.1, 0.1);

  return weaponGroup;
}

const pistolColors = {
  maroon: 0x8a4248,
  maroonDark: 0x6e3338,
  frame: 0x383f46,
  charcoal: 0x2a2f35,
  plasma: 0x2efcff,
};

function createPlasmaPart(geometry: THREE.BufferGeometry): THREE.Group {
  return createPart(geometry, pistolColors.plasma);
}

/** Compact plasma pistol — voxel block kit; barrel along +X. */
export function createPistol(): THREE.Group {
  const weaponGroup = new THREE.Group();

  // --- Central chassis ---
  const core = createPart(new THREE.BoxGeometry(1.55, 0.38, 0.38), pistolColors.frame);
  core.position.set(0.55, 0.12, 0);
  weaponGroup.add(core);

  const undercarriage = createPart(new THREE.BoxGeometry(1.1, 0.12, 0.34), pistolColors.charcoal);
  undercarriage.position.set(0.35, -0.12, 0);
  weaponGroup.add(undercarriage);

  // --- Maroon barrel housing (stepped voxel shell) ---
  const topHousing = createPart(new THREE.BoxGeometry(1.45, 0.22, 0.44), pistolColors.maroon);
  topHousing.position.set(0.62, 0.38, 0);
  weaponGroup.add(topHousing);

  const topStep = createPart(new THREE.BoxGeometry(1.2, 0.1, 0.4), pistolColors.maroonDark);
  topStep.position.set(0.72, 0.5, 0);
  weaponGroup.add(topStep);

  const bottomHousing = createPart(new THREE.BoxGeometry(1.35, 0.16, 0.42), pistolColors.maroon);
  bottomHousing.position.set(0.65, -0.02, 0);
  weaponGroup.add(bottomHousing);

  const sideL = createPart(new THREE.BoxGeometry(1.3, 0.34, 0.1), pistolColors.maroon);
  sideL.position.set(0.6, 0.18, -0.22);
  weaponGroup.add(sideL);

  const sideR = createPart(new THREE.BoxGeometry(1.3, 0.34, 0.1), pistolColors.maroon);
  sideR.position.set(0.6, 0.18, 0.22);
  weaponGroup.add(sideR);

  const rearCap = createPart(new THREE.BoxGeometry(0.28, 0.42, 0.46), pistolColors.maroonDark);
  rearCap.position.set(-0.08, 0.16, 0);
  weaponGroup.add(rearCap);

  const frontBevel = createPart(new THREE.BoxGeometry(0.35, 0.4, 0.44), pistolColors.maroon);
  frontBevel.position.set(1.42, 0.14, 0);
  weaponGroup.add(frontBevel);

  // --- Curved segmented plasma vents (top + sides) ---
  const ventSpecs = [
    { x: 0.35, y: 0.48, z: 0, ry: 0, rz: 0.12 },
    { x: 0.72, y: 0.46, z: 0, ry: 0, rz: 0.08 },
    { x: 1.08, y: 0.42, z: 0, ry: 0, rz: 0.04 },
    { x: 0.5, y: 0.36, z: -0.2, ry: 0.22, rz: 0.18 },
    { x: 0.88, y: 0.32, z: -0.2, ry: 0.14, rz: 0.1 },
    { x: 0.5, y: 0.36, z: 0.2, ry: -0.22, rz: 0.18 },
    { x: 0.88, y: 0.32, z: 0.2, ry: -0.14, rz: 0.1 },
  ];

  for (const vent of ventSpecs) {
    const strip = createPlasmaPart(new THREE.BoxGeometry(0.42, 0.05, 0.06));
    strip.position.set(vent.x, vent.y, vent.z);
    strip.rotation.set(0, vent.ry, vent.rz);
    weaponGroup.add(strip);
  }

  // --- Micro-plasma array (3×3 recessed cluster, upper-rear) ---
  const arrayOrigin = { x: 0.08, y: 0.34, z: 0 };
  const cellSize = 0.07;
  const cellGap = 0.085;

  const arrayRecess = createPart(new THREE.BoxGeometry(0.32, 0.12, 0.32), pistolColors.charcoal);
  arrayRecess.position.set(arrayOrigin.x, arrayOrigin.y, arrayOrigin.z);
  weaponGroup.add(arrayRecess);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = createPlasmaPart(new THREE.BoxGeometry(cellSize, cellSize, cellSize));
      cell.position.set(
        arrayOrigin.x - cellGap + col * cellGap,
        arrayOrigin.y + 0.04,
        arrayOrigin.z - cellGap + row * cellGap,
      );
      weaponGroup.add(cell);
    }
  }

  // --- Muzzle focus aperture ---
  const muzzlePlate = createPart(new THREE.BoxGeometry(0.14, 0.52, 0.52), pistolColors.charcoal);
  muzzlePlate.position.set(1.72, 0.14, 0);
  weaponGroup.add(muzzlePlate);

  const muzzleRing = createPart(new THREE.BoxGeometry(0.06, 0.56, 0.56), pistolColors.frame);
  muzzleRing.position.set(1.66, 0.14, 0);
  weaponGroup.add(muzzleRing);

  const centerPort = createPlasmaPart(new THREE.BoxGeometry(0.08, 0.1, 0.1));
  centerPort.position.set(1.78, 0.14, 0);
  weaponGroup.add(centerPort);

  const portRadius = 0.16;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const port = createPlasmaPart(new THREE.BoxGeometry(0.07, 0.07, 0.07));
    port.position.set(
      1.78,
      0.14 + Math.sin(angle) * portRadius,
      Math.cos(angle) * portRadius,
    );
    weaponGroup.add(port);
  }

  // --- Power cell (visible through side gap) ---
  const cellSlot = createPart(new THREE.BoxGeometry(0.14, 0.28, 0.2), pistolColors.charcoal);
  cellSlot.position.set(0.42, 0.08, 0);
  weaponGroup.add(cellSlot);

  const powerCell = createPlasmaPart(new THREE.BoxGeometry(0.1, 0.22, 0.14));
  powerCell.position.set(0.42, 0.08, 0);
  weaponGroup.add(powerCell);

  // --- Ergonomic stepped flex-voxel grip ---
  const gripSteps = [
    { w: 0.34, h: 0.13, d: 0.36, x: 0.04, y: -0.2 },
    { w: 0.32, h: 0.13, d: 0.34, x: -0.02, y: -0.32 },
    { w: 0.3, h: 0.13, d: 0.32, x: -0.08, y: -0.44 },
    { w: 0.28, h: 0.12, d: 0.3, x: -0.13, y: -0.55 },
    { w: 0.24, h: 0.1, d: 0.28, x: -0.17, y: -0.64 },
  ];

  for (const step of gripSteps) {
    const block = createPart(
      new THREE.BoxGeometry(step.w, step.h, step.d),
      pistolColors.charcoal,
    );
    block.position.set(step.x, step.y, 0);
    block.rotation.z = -0.1;
    weaponGroup.add(block);
  }

  const gripCap = createPart(new THREE.BoxGeometry(0.22, 0.08, 0.26), pistolColors.frame);
  gripCap.position.set(-0.19, -0.7, 0);
  gripCap.rotation.z = -0.1;
  weaponGroup.add(gripCap);

  // --- Trigger guard + trigger ---
  const guardTop = createPart(new THREE.BoxGeometry(0.22, 0.05, 0.28), pistolColors.frame);
  guardTop.position.set(0.12, -0.08, 0);
  weaponGroup.add(guardTop);

  const guardFront = createPart(new THREE.BoxGeometry(0.05, 0.2, 0.26), pistolColors.frame);
  guardFront.position.set(0.24, -0.2, 0);
  weaponGroup.add(guardFront);

  const guardRear = createPart(new THREE.BoxGeometry(0.05, 0.22, 0.24), pistolColors.frame);
  guardRear.position.set(-0.02, -0.22, 0);
  weaponGroup.add(guardRear);

  const trigger = createPart(new THREE.BoxGeometry(0.05, 0.1, 0.08), pistolColors.maroonDark);
  trigger.position.set(0.1, -0.18, 0);
  trigger.rotation.z = -0.35;
  weaponGroup.add(trigger);

  weaponGroup.scale.set(0.1, 0.1, 0.1);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzlePlate.add(muzzle);
  muzzle.position.set(0, 0, 0);
  weaponGroup.userData.weaponMuzzle = muzzle;

  return weaponGroup;
}

/** @deprecated Use createPlasmaRifle */
export const createWeapon = createPlasmaRifle;
