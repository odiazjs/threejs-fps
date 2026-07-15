import * as THREE from 'three';

/** Soft grey puff sprite — normal blending reads as wisps, not energy glow. */
let smokePuffTexture: THREE.CanvasTexture | null = null;

export function getSmokePuffTexture(): THREE.CanvasTexture {
  if (!smokePuffTexture) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.28, 'rgba(240, 245, 250, 0.62)');
    gradient.addColorStop(0.62, 'rgba(215, 225, 235, 0.28)');
    gradient.addColorStop(1, 'rgba(190, 200, 210, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    smokePuffTexture = new THREE.CanvasTexture(canvas);
  }
  return smokePuffTexture;
}

export function touchSmokeTrailAssets(): void {
  getSmokePuffTexture();
}
