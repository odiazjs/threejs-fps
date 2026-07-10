import * as THREE from 'three';

/** Shared GPU assets for bio-liquid blobs — never disposed per shot. */
let blobCoreGeometry: THREE.SphereGeometry | null = null;
let blobHaloGeometry: THREE.SphereGeometry | null = null;
let blobTrailGeometry: THREE.SphereGeometry | null = null;
let blobCoreMaterial: THREE.MeshBasicMaterial | null = null;
let blobHaloMaterial: THREE.MeshBasicMaterial | null = null;
let blobTrailMaterial: THREE.MeshBasicMaterial | null = null;

export function getBioLiquidCoreGeometry(): THREE.SphereGeometry {
  if (!blobCoreGeometry) {
    blobCoreGeometry = new THREE.SphereGeometry(0.11, 10, 8);
  }
  return blobCoreGeometry;
}

export function getBioLiquidHaloGeometry(): THREE.SphereGeometry {
  if (!blobHaloGeometry) {
    blobHaloGeometry = new THREE.SphereGeometry(0.2, 10, 8);
  }
  return blobHaloGeometry;
}

export function getBioLiquidTrailGeometry(): THREE.SphereGeometry {
  if (!blobTrailGeometry) {
    blobTrailGeometry = new THREE.SphereGeometry(0.055, 6, 5);
  }
  return blobTrailGeometry;
}

export function getBioLiquidCoreMaterial(): THREE.MeshBasicMaterial {
  if (!blobCoreMaterial) {
    blobCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xb8ff3a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }
  return blobCoreMaterial;
}

export function getBioLiquidHaloMaterial(): THREE.MeshBasicMaterial {
  if (!blobHaloMaterial) {
    blobHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0x5cff7a,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }
  return blobHaloMaterial;
}

export function getBioLiquidTrailMaterial(): THREE.MeshBasicMaterial {
  if (!blobTrailMaterial) {
    blobTrailMaterial = new THREE.MeshBasicMaterial({
      color: 0x1faa4a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }
  return blobTrailMaterial;
}

export function touchBioLiquidBoltAssets(): void {
  getBioLiquidCoreGeometry();
  getBioLiquidHaloGeometry();
  getBioLiquidTrailGeometry();
  getBioLiquidCoreMaterial();
  getBioLiquidHaloMaterial();
  getBioLiquidTrailMaterial();
}
