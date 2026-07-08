import {
  buildKillhouseServerColliders,
  type OrientedBoxCollider,
} from '../../shared/level/killhouseServerColliders';
import { MAP_HALF_X, MAP_HALF_Z } from '../../shared/level/killhouseSmallColliders';
import type { MinimapLayout } from '../ui/minimapTypes';

export function buildKillhouseMinimapLayout(): MinimapLayout {
  const colliders = buildKillhouseServerColliders();

  return {
    label: 'CHRONO-BOWL',
    bounds: {
      minX: -MAP_HALF_X,
      maxX: MAP_HALF_X,
      minZ: -MAP_HALF_Z,
      maxZ: MAP_HALF_Z,
    },
    obstacles: colliders.map(orientedBoxToMinimapObstacle),
  };
}

function orientedBoxToMinimapObstacle(box: OrientedBoxCollider) {
  const cos = Math.abs(Math.cos(box.rotationY));
  const sin = Math.abs(Math.sin(box.rotationY));
  const extX = cos * box.halfX + sin * box.halfZ;
  const extZ = sin * box.halfX + cos * box.halfZ;

  return {
    minX: box.centerX - extX,
    maxX: box.centerX + extX,
    minZ: box.centerZ - extZ,
    maxZ: box.centerZ + extZ,
    tall: box.halfY > 0.5,
    kind: 'structure' as const,
  };
}
