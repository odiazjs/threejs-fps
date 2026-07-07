import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';

/** Shared GPU assets for plasma bolts — never disposed per shot. */
let coreGeometry: THREE.CapsuleGeometry | null = null;
let glowGeometry: THREE.SphereGeometry | null = null;
let coreMaterial: THREE.MeshBasicMaterial | null = null;
let glowMaterial: THREE.MeshBasicMaterial | null = null;

export function getBoltCoreGeometry(): THREE.CapsuleGeometry {
  if (!coreGeometry) {
    coreGeometry = new THREE.CapsuleGeometry(0.028, 0.22, 4, 8);
  }
  return coreGeometry;
}

export function getBoltGlowGeometry(): THREE.SphereGeometry {
  if (!glowGeometry) {
    glowGeometry = new THREE.SphereGeometry(0.09, 6, 4);
  }
  return glowGeometry;
}

export function getBoltCoreMaterial(): THREE.MeshBasicMaterial {
  if (!coreMaterial) {
    coreMaterial = new THREE.MeshBasicMaterial({
      color: MAP_PALETTE.neonCyan,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }
  return coreMaterial;
}

export function getBoltGlowMaterial(): THREE.MeshBasicMaterial {
  if (!glowMaterial) {
    glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x55eeff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }
  return glowMaterial;
}
