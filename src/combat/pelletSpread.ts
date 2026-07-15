import * as THREE from 'three';

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/** Organic buckshot scatter — jitters the deterministic ring per shell/pellet. */
export interface PelletScatterOptions {
  /** Rotates the whole ring (randomize once per shell so patterns differ). */
  ringPhase?: number;
  /** 0..1 multiplier on `spreadRad` for this pellet (radial jitter). */
  radiusScale?: number;
  /** Radians added to this pellet's ring slot (angular jitter). */
  angleJitter?: number;
}

/**
 * Build a unit direction for one shotgun pellet.
 * Pellet 0 stays on the aim ray; remaining pellets sit on a ring at `spreadRad`,
 * optionally scattered by `PelletScatterOptions` so shells read as buckshot
 * rather than a perfect hexagon.
 */
export function readPelletDirection(
  aimDir: THREE.Vector3,
  pelletIndex: number,
  pelletCount: number,
  spreadRad: number,
  out: THREE.Vector3,
  scatter?: PelletScatterOptions,
): THREE.Vector3 {
  _forward.copy(aimDir);
  if (_forward.lengthSq() < 1e-8) {
    out.set(0, 0, -1);
    return out;
  }
  _forward.normalize();

  if (pelletCount <= 1 || spreadRad <= 0 || pelletIndex <= 0) {
    return out.copy(_forward);
  }

  _right.crossVectors(_forward, _worldUp);
  if (_right.lengthSq() < 1e-8) {
    _right.set(1, 0, 0);
  } else {
    _right.normalize();
  }
  _up.crossVectors(_right, _forward).normalize();

  const ringCount = Math.max(1, pelletCount - 1);
  const ringIndex = pelletIndex - 1;
  const yaw =
    (ringIndex / ringCount) * Math.PI * 2 +
    (scatter?.ringPhase ?? 0) +
    (scatter?.angleJitter ?? 0);
  const radius = spreadRad * THREE.MathUtils.clamp(scatter?.radiusScale ?? 1, 0, 1);
  const sinPitch = Math.sin(radius);
  const cosPitch = Math.cos(radius);

  out
    .copy(_forward)
    .multiplyScalar(cosPitch)
    .addScaledVector(_right, Math.cos(yaw) * sinPitch)
    .addScaledVector(_up, Math.sin(yaw) * sinPitch);

  return out.normalize();
}
