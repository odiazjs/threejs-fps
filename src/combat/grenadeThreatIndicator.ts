import * as THREE from 'three';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import { GRENADE_BLAST_RADIUS } from '../../shared/throwables/grenadeConfig';
import type { ActiveGrenadeSnapshot } from './GrenadeManager';

export interface NearbyGrenadeThreat {
  id: string;
  x: number;
  y: number;
  z: number;
  proximity: number;
}

export interface GrenadeThreatFilter {
  localSessionId: string;
  localTeamId: number;
  friendlyFire: boolean;
}

const _grenadePos = new THREE.Vector3();

export function isEnemyGrenadeThrower(
  throwerId: string,
  throwerTeamId: number | null,
  filter: GrenadeThreatFilter,
): boolean {
  if (!throwerId || throwerId === filter.localSessionId) return false;
  if (isTrainingBotSessionId(throwerId)) return true;
  if (throwerTeamId === null) return true;
  if (throwerTeamId === filter.localTeamId) return filter.friendlyFire;
  return true;
}

export function collectNearbyEnemyGrenades(
  playerCenter: THREE.Vector3,
  grenades: readonly ActiveGrenadeSnapshot[],
  filter: GrenadeThreatFilter,
  out: NearbyGrenadeThreat[],
): NearbyGrenadeThreat[] {
  out.length = 0;
  const radiusSq = GRENADE_BLAST_RADIUS * GRENADE_BLAST_RADIUS;

  for (const grenade of grenades) {
    if (grenade.isOwn || grenade.throwerId === filter.localSessionId) continue;
    if (!isEnemyGrenadeThrower(grenade.throwerId, grenade.throwerTeamId, filter)) continue;

    _grenadePos.set(grenade.x, grenade.y, grenade.z);
    const distSq = playerCenter.distanceToSquared(_grenadePos);
    if (distSq > radiusSq) continue;

    const dist = Math.sqrt(distSq);
    out.push({
      id: grenade.id,
      x: grenade.x,
      y: grenade.y,
      z: grenade.z,
      proximity: 1 - dist / GRENADE_BLAST_RADIUS,
    });
  }

  return out;
}
