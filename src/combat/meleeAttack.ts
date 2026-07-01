import * as THREE from 'three';
import { findMeleeHitTarget, type MeleeHitCandidate } from '../../shared/combat/meleeHit';
import type { ProjectileHitTarget } from './ProjectileManager';

const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();

export interface MeleeHitResult {
  sessionId: string;
  point: THREE.Vector3;
}

/** Camera look direction + proximity cone vs enemy targets. */
export function tryMeleeHit(
  camera: THREE.Camera,
  range: number,
  getTargets: () => ProjectileHitTarget[],
  ownerSessionId: string,
): MeleeHitResult | null {
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_direction);

  const candidates: MeleeHitCandidate[] = getTargets().map((target) => ({
    sessionId: target.sessionId,
    feetX: target.feetX,
    feetY: target.feetY,
    feetZ: target.feetZ,
  }));

  const hit = findMeleeHitTarget(
    {
      eyeX: _origin.x,
      eyeY: _origin.y,
      eyeZ: _origin.z,
      dirX: _direction.x,
      dirY: _direction.y,
      dirZ: _direction.z,
    },
    range,
    candidates,
    ownerSessionId,
  );
  if (!hit) return null;

  return {
    sessionId: hit.sessionId,
    point: new THREE.Vector3(hit.pointX, hit.pointY, hit.pointZ),
  };
}
