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

/** @deprecated Use createPlasmaRifle */
export const createWeapon = createPlasmaRifle;
