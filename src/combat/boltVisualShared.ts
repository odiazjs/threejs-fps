import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';

/** Shared GPU assets for plasma bolts — never disposed per shot. */
let coreGeometry: THREE.CapsuleGeometry | null = null;
let glowGeometry: THREE.SphereGeometry | null = null;
let coreMaterial: THREE.MeshBasicMaterial | null = null;
let glowMaterial: THREE.MeshBasicMaterial | null = null;
let haloTexture: THREE.CanvasTexture | null = null;
let trailGeometry: THREE.CylinderGeometry | null = null;

/** Tail length behind the bolt (world units) — sells the flight speed. */
export const BOLT_TRAIL_LENGTH = 2.2;

export function getBoltCoreGeometry(): THREE.CapsuleGeometry {
  if (!coreGeometry) {
    coreGeometry = new THREE.CapsuleGeometry(0.028, 0.22, 4, 8);
  }
  return coreGeometry;
}

/**
 * Soft radial-gradient disc for camera-facing halo sprites — fakes renderer
 * bloom without a post-processing pass.
 */
export function getBoltHaloTexture(): THREE.CanvasTexture {
  if (!haloTexture) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.22, 'rgba(255, 255, 255, 0.65)');
    gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.18)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    haloTexture = new THREE.CanvasTexture(canvas);
  }
  return haloTexture;
}

/**
 * Tapered streak tail — wide at the bolt, needle-thin at the rear. Authored
 * along +Y from y=0; rotate x by PI/2 so it trails behind (+Z in bolt space).
 */
export function getBoltTrailGeometry(): THREE.CylinderGeometry {
  if (!trailGeometry) {
    trailGeometry = new THREE.CylinderGeometry(
      0.006,
      0.065,
      BOLT_TRAIL_LENGTH,
      6,
      1,
      true,
    );
    trailGeometry.translate(0, BOLT_TRAIL_LENGTH * 0.5, 0);
  }
  return trailGeometry;
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
