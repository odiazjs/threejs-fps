import * as THREE from 'three';

const WIDTH = 2048;
const HEIGHT = 1024;

type RGB = [number, number, number];

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function addRgb(a: RGB, b: RGB): RGB {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleRgb(c: RGB, s: number): RGB {
  return [c[0] * s, c[1] * s, c[2] * s];
}

function directionFromUV(u: number, v: number): [number, number, number] {
  const theta = u * Math.PI * 2;
  const phi = (0.5 - v) * Math.PI;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.sin(theta), Math.sin(phi), cosPhi * Math.cos(theta)];
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function skyGradient(y: number): RGB {
  const t = clamp01((y + 0.02) / 0.98);
  const zenith: RGB = [0.1, 0.06, 0.3];
  const upper: RGB = [0.16, 0.28, 0.62];
  const mid: RGB = [0.24, 0.52, 0.84];
  const horizon: RGB = [0.44, 0.8, 0.95];
  const glow: RGB = [0.58, 0.9, 0.98];

  if (t > 0.62) {
    return lerpRgb(upper, zenith, (t - 0.62) / 0.38);
  }
  if (t > 0.34) {
    return lerpRgb(mid, upper, (t - 0.34) / 0.28);
  }
  if (t > 0.12) {
    return lerpRgb(horizon, mid, (t - 0.12) / 0.22);
  }
  return lerpRgb(glow, horizon, t / 0.12);
}

/** Seamless horizon haze — elevation only, no longitude dependency. */
function horizonHaze(y: number): number {
  if (y < 0.04 || y > 0.3) return 0;
  return smoothstep(0.06, 0.14, y) * smoothstep(0.27, 0.16, y);
}

/** Single subtle orbital arc — periodic in azimuth so the panorama wraps cleanly. */
function ringStrength(theta: number, y: number): number {
  const elev = smoothstep(0.32, 0.48, y) * smoothstep(0.62, 0.46, y);
  const arc = 0.55 + 0.45 * Math.sin(theta * 1.15 + 0.6);
  const band = smoothstep(0.72, 0.88, arc);
  return band * elev * 0.42;
}

/** Tiny sparse star points — hashed on direction so there is no wrap seam. */
function starStrength(x: number, y: number, z: number): number {
  if (y < 0.4) return 0;

  const scale = 340;
  const ix = Math.floor(x * scale);
  const iy = Math.floor(y * scale);
  const iz = Math.floor(z * scale);
  const h = hash2(ix * 5 + iz * 3, iy * 7 + iz);
  if (h < 0.9982) return 0;

  const fx = x * scale - ix;
  const fy = y * scale - iy;
  const fz = z * scale - iz;
  const dist2 = fx * fx + fy * fy + fz * fz;
  const point = smoothstep(0.045, 0, dist2);
  const fade = smoothstep(0.4, 0.58, y);
  return point * fade * (0.45 + h * 0.55);
}

function sampleSky(u: number, v: number): RGB {
  const [x, y, z] = directionFromUV(u, v);
  const theta = Math.atan2(x, z);

  let color = skyGradient(y);

  const haze = horizonHaze(y);
  const hazeColor: RGB = [0.9, 0.95, 1.0];
  color = lerpRgb(color, hazeColor, haze * 0.55);

  const ring = ringStrength(theta, y);
  const ringColor: RGB = [0.05, 0.07, 0.14];
  const ringRim: RGB = [0.2, 0.38, 0.58];
  color = lerpRgb(color, ringColor, ring * 0.75);
  color = addRgb(color, scaleRgb(ringRim, ring * 0.14));

  const star = starStrength(x, y, z);
  color = addRgb(color, scaleRgb([1, 1, 1], star * 0.7));

  return [clamp01(color[0]), clamp01(color[1]), clamp01(color[2])];
}

function buildSkyCanvas(sample: (u: number, v: number) => RGB): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(WIDTH, HEIGHT);

  for (let py = 0; py < HEIGHT; py++) {
    const v = py / (HEIGHT - 1);
    for (let px = 0; px < WIDTH; px++) {
      const u = px / WIDTH;
      const [r, g, b] = sample(u, v);
      const i = (py * WIDTH + px) * 4;
      image.data[i] = Math.round(r * 255);
      image.data[i + 1] = Math.round(g * 255);
      image.data[i + 2] = Math.round(b * 255);
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function createPanoramaTexture(sample: (u: number, v: number) => RGB): THREE.Texture {
  const texture = new THREE.CanvasTexture(buildSkyCanvas(sample));
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Procedural sci-fi panorama sky — no texture assets required. */
export function createSkyboxTexture(): THREE.Texture {
  return createPanoramaTexture(sampleSky);
}

function azimuthDistance(u: number, center: number): number {
  const d = Math.abs(u - center);
  return Math.min(d, 1 - d);
}

function killhouseSkyGradient(y: number): RGB {
  const t = clamp01((y + 0.04) / 0.96);
  const zenith: RGB = [0.22, 0.58, 0.82];
  const upper: RGB = [0.34, 0.68, 0.9];
  const mid: RGB = [0.52, 0.76, 0.94];
  const horizon: RGB = [0.92, 0.72, 0.42];
  const sunTint: RGB = [0.98, 0.84, 0.48];

  if (t > 0.62) {
    return lerpRgb(upper, zenith, (t - 0.62) / 0.38);
  }
  if (t > 0.28) {
    return lerpRgb(mid, upper, (t - 0.28) / 0.34);
  }
  if (t > 0.1) {
    return lerpRgb(horizon, mid, (t - 0.1) / 0.18);
  }
  return lerpRgb(sunTint, horizon, t / 0.1);
}

function sunBloom(u: number, y: number): number {
  const du = azimuthDistance(u, 0.5);
  const dy = y - 0.44;
  const core = Math.exp(-((du / 0.055) ** 2 + (dy / 0.14) ** 2));
  const halo = Math.exp(-((du / 0.14) ** 2 + (dy / 0.22) ** 2)) * 0.45;
  return core + halo;
}

function sampleKillhouseSky(u: number, v: number): RGB {
  const [, y] = directionFromUV(u, v);

  let color = killhouseSkyGradient(y);

  const bloom = sunBloom(u, y);
  const sunColor: RGB = [1.0, 0.9, 0.55];
  color = lerpRgb(color, sunColor, bloom * 0.85);

  const haze = smoothstep(0.03, 0.1, y) * smoothstep(0.2, 0.1, y);
  color = lerpRgb(color, [0.88, 0.72, 0.48], haze * 0.28);

  return [clamp01(color[0]), clamp01(color[1]), clamp01(color[2])];
}

/** Dusk panorama with sun glow — used by Chrono-Bowl. */
export function createKillhouseSkyboxTexture(): THREE.Texture {
  return createPanoramaTexture(sampleKillhouseSky);
}
