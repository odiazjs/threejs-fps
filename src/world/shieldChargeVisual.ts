import * as THREE from 'three';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines.js';

const CYAN = 0x00e8ff;
const CYAN_DARK = 0x0099bb;

export function createShieldChargePickup(): THREE.Group {
  const group = new THREE.Group();

  const core = createFlatKitMesh(
    new THREE.OctahedronGeometry(0.2, 0),
    CYAN,
  );
  core.position.y = 0.55;
  group.add(core);

  const ring = createFlatKitMesh(
    new THREE.TorusGeometry(0.28, 0.05, 8, 16),
    CYAN_DARK,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.42;
  group.add(ring);

  const base = createFlatKitMesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.14, 8),
    CYAN_DARK,
  );
  base.position.y = 0.07;
  group.add(base);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.position.y = 0.5;
  group.add(glow);

  return group;
}
