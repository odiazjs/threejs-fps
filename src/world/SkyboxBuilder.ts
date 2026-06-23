import * as THREE from 'three';
import { SKY } from '../content/theme';

const ZENITH = 0x7a9ab5;
const GROUND = 0x5c6670;
const FACE_SIZE = 512;

function fillGradient(
  ctx: CanvasRenderingContext2D,
  top: number,
  bottom: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, FACE_SIZE);
  gradient.addColorStop(0, `#${new THREE.Color(top).getHexString()}`);
  gradient.addColorStop(1, `#${new THREE.Color(bottom).getHexString()}`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);
}

function fillSolid(ctx: CanvasRenderingContext2D, color: number): void {
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);
}

function createFaceCanvas(kind: 'side' | 'top' | 'bottom'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_SIZE;
  canvas.height = FACE_SIZE;

  const ctx = canvas.getContext('2d')!;
  if (kind === 'top') {
    fillSolid(ctx, ZENITH);
  } else if (kind === 'bottom') {
    fillSolid(ctx, GROUND);
  } else {
    fillGradient(ctx, ZENITH, SKY);
  }

  return canvas;
}

/** Procedural cube-map sky — no texture assets required. */
export function createSkyboxTexture(): THREE.CubeTexture {
  const images = [
    createFaceCanvas('side'), // +X
    createFaceCanvas('side'), // -X
    createFaceCanvas('top'), // +Y
    createFaceCanvas('bottom'), // -Y
    createFaceCanvas('side'), // +Z
    createFaceCanvas('side'), // -Z
  ];

  const texture = new THREE.CubeTexture(images);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
