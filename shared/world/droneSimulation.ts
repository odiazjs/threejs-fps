const MAP_HALF = 60;
const MAP_MARGIN = 14;
const DRONE_SEED = 0x0d20e;

export const DRONE_COUNT = 10;

/** Global patrol speed multiplier — keep orbits calm with the FBX drone. */
export const DRONE_MOVEMENT_SCALE = 0.7;

export interface DroneLookResponseConfig {
  /** Look detection range — matches drone proximity audio (meters). */
  readonly maxDistance: number;
  readonly lookAngleDeg: number;
  /** Lateral dodge speed applied when the player first spots the drone (m/s). */
  readonly escapeLateralSpeed: number;
  /** Small upward kick on escape (m/s). */
  readonly escapeVerticalSpeed: number;
  /** How quickly escape velocity bleeds off (per second). */
  readonly escapeDamping: number;
  /** Pulls the drone back toward its patrol path after dodging (per second). */
  readonly escapeReturn: number;
  /** Max roll tilt during a dodge (radians). */
  readonly escapeBank: number;
}

export const DEFAULT_DRONE_LOOK_RESPONSE: DroneLookResponseConfig = {
  maxDistance: 24,
  lookAngleDeg: 22,
  escapeLateralSpeed: 18,
  escapeVerticalSpeed: 4.5,
  escapeDamping: 0.65,
  escapeReturn: 0.55,
  escapeBank: 0.6,
};

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

export function computeDronePose(
  config: DroneConfig,
  time: number,
  speedScale = DRONE_MOVEMENT_SCALE,
): DronePose {
  const speed = config.speed * speedScale;
  const x =
    config.anchorX +
    Math.sin(time * speed + config.phaseX) * config.radius;
  const z =
    config.anchorZ +
    Math.cos(time * speed * 0.82 + config.phaseZ) * config.radius * 0.88;
  const y = config.height + Math.sin(time * 1.15 + config.phaseY) * 1.4;

  const dxdt =
    Math.cos(time * speed + config.phaseX) * config.radius * speed;
  const dzdt =
    -Math.sin(time * speed * 0.82 + config.phaseZ) *
    config.radius *
    0.88 *
    speed *
    0.82;

  return {
    x,
    y,
    z,
    yaw: Math.hypot(dxdt, dzdt) > 1e-6 ? Math.atan2(dxdt, dzdt) : 0,
    bank: Math.sin(time * 2.1 + config.phaseX) * 0.08 * Math.min(speedScale, 2.2),
    propellerSpin: time * 34 * config.spinDir * speedScale,
  };
}

export function isDroneObserved(
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  cameraForwardX: number,
  cameraForwardY: number,
  cameraForwardZ: number,
  droneX: number,
  droneY: number,
  droneZ: number,
  rangeMax: number,
  lookAngleDeg: number,
): boolean {
  const dx = droneX - cameraX;
  const dy = droneY - cameraY;
  const dz = droneZ - cameraZ;
  const distance = Math.hypot(dx, dy, dz);
  if (distance > rangeMax || distance < 1e-4) return false;

  const invDist = 1 / distance;
  const dot =
    dx * invDist * cameraForwardX +
    dy * invDist * cameraForwardY +
    dz * invDist * cameraForwardZ;
  const cosThreshold = Math.cos((lookAngleDeg * Math.PI) / 180);
  return dot >= cosThreshold;
}
