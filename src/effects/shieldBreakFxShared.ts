import * as THREE from 'three';

const CYAN = new THREE.Color(0x00d8ff);
const CYAN_BRIGHT = new THREE.Color(0x9afbff);

const FX = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
} as const;

let shellMaterial: THREE.MeshBasicMaterial | null = null;
let rimMaterial: THREE.MeshBasicMaterial | null = null;
let shardMaterial: THREE.PointsMaterial | null = null;

export function createShieldBreakShellMaterial(): THREE.MeshBasicMaterial {
  if (!shellMaterial) {
    shellMaterial = new THREE.MeshBasicMaterial({
      color: CYAN,
      ...FX,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
  }
  return shellMaterial.clone();
}

export function createShieldBreakRimMaterial(): THREE.MeshBasicMaterial {
  if (!rimMaterial) {
    rimMaterial = new THREE.MeshBasicMaterial({
      color: CYAN_BRIGHT,
      ...FX,
      opacity: 0.85,
      side: THREE.BackSide,
    });
  }
  return rimMaterial.clone();
}

export function createShieldBreakShardMaterial(): THREE.PointsMaterial {
  if (!shardMaterial) {
    shardMaterial = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      ...FX,
      opacity: 0.95,
      sizeAttenuation: true,
    });
  }
  return shardMaterial.clone();
}
