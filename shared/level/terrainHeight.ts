import { COLUMN_POSITIONS, MAP_HALF } from './kiloSectorColliders.js';

interface Hill {
  x: number;
  z: number;
  radius: number;
  height: number;
}

const HILLS: Hill[] = [
  { x: -38, z: 28, radius: 18, height: 1.0 },
  { x: 42, z: -32, radius: 20, height: 1.15 },
  { x: -28, z: -42, radius: 16, height: 0.9 },
  { x: 45, z: 35, radius: 14, height: 0.8 },
  { x: -15, z: 48, radius: 17, height: 1.05 },
  { x: 22, z: 18, radius: 13, height: 0.7 },
  { x: -48, z: -10, radius: 15, height: 0.95 },
  { x: 10, z: -45, radius: 16, height: 0.85 },
  { x: 35, z: 8, radius: 12, height: 0.75 },
  { x: -8, z: -22, radius: 14, height: 0.65 },
];

const FLATTEN_COLUMN_RADIUS = 3.2;
const FLATTEN_COLUMN_BLEND = 6.5;

function hillContribution(x: number, z: number, hill: Hill): number {
  const dx = x - hill.x;
  const dz = z - hill.z;
  const distSq = dx * dx + dz * dz;
  const radiusSq = hill.radius * hill.radius;
  if (distSq >= radiusSq) return 0;

  const t = 1 - distSq / radiusSq;
  return hill.height * t * t * (3 - 2 * t);
}

function flattenFactor(x: number, z: number): number {
  let factor = 1;

  for (const column of COLUMN_POSITIONS) {
    const dist = Math.hypot(x - column.x, z - column.z);
    if (dist <= FLATTEN_COLUMN_RADIUS) return 0;
    if (dist < FLATTEN_COLUMN_BLEND) {
      const blend = (dist - FLATTEN_COLUMN_RADIUS) / (FLATTEN_COLUMN_BLEND - FLATTEN_COLUMN_RADIUS);
      factor = Math.min(factor, blend * blend * (3 - 2 * blend));
    }
  }

  return factor;
}

function rollingNoise(x: number, z: number): number {
  return (
    Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.1 +
    Math.sin(x * 0.18 + z * 0.14) * 0.05 +
    Math.sin(x * 0.04 - z * 0.05) * 0.06
  );
}

export function sampleGroundHeight(x: number, z: number): number {
  if (Math.abs(x) > MAP_HALF || Math.abs(z) > MAP_HALF) return 0;

  let height = rollingNoise(x, z);
  for (const hill of HILLS) {
    height += hillContribution(x, z, hill);
  }

  return height * flattenFactor(x, z);
}
