import { COLUMN_POSITIONS, MAP_HALF } from '../level/kiloSectorColliders.js';

export const DRONE_COUNT = 10;
const MAP_MARGIN = 14;
const COLUMN_CLEARANCE = 12;
const DRONE_SEED = 0x0d20e;

export interface DroneConfig {
  anchorX: number;
  anchorZ: number;
  radius: number;
  height: number;
  speed: number;
  phaseX: number;
  phaseZ: number;
  phaseY: number;
  spinDir: number;
}

export interface DronePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
  propellerSpin: number;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateDroneConfigs(): DroneConfig[] {
  const rand = seededRandom(DRONE_SEED);
  const configs: DroneConfig[] = [];
  const inner = MAP_HALF - MAP_MARGIN;

  while (configs.length < DRONE_COUNT) {
    const anchorX = (rand() * 2 - 1) * inner;
    const anchorZ = (rand() * 2 - 1) * inner;

    const nearColumn = COLUMN_POSITIONS.some((column) => {
      return Math.hypot(anchorX - column.x, anchorZ - column.z) < COLUMN_CLEARANCE;
    });
    if (nearColumn) continue;

    configs.push({
      anchorX,
      anchorZ,
      radius: 8 + rand() * 14,
      height: 7 + rand() * 9,
      speed: 0.14 + rand() * 0.16,
      phaseX: rand() * Math.PI * 2,
      phaseZ: rand() * Math.PI * 2,
      phaseY: rand() * Math.PI * 2,
      spinDir: rand() > 0.5 ? 1 : -1,
    });
  }

  return configs;
}

export function computeDronePose(config: DroneConfig, time: number): DronePose {
  const x =
    config.anchorX +
    Math.sin(time * config.speed + config.phaseX) * config.radius;
  const z =
    config.anchorZ +
    Math.cos(time * config.speed * 0.82 + config.phaseZ) * config.radius * 0.88;
  const y = config.height + Math.sin(time * 1.15 + config.phaseY) * 1.4;

  const dxdt =
    Math.cos(time * config.speed + config.phaseX) * config.radius * config.speed;
  const dzdt =
    -Math.sin(time * config.speed * 0.82 + config.phaseZ) *
    config.radius *
    0.88 *
    config.speed *
    0.82;

  return {
    x,
    y,
    z,
    yaw: Math.hypot(dxdt, dzdt) > 1e-6 ? Math.atan2(dxdt, dzdt) : 0,
    bank: Math.sin(time * 2.1 + config.phaseX) * 0.08,
    propellerSpin: time * 34 * config.spinDir,
  };
}
