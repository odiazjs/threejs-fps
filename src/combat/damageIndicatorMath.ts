import * as THREE from 'three';
import type { ProjectileSpawnMessage } from '../../shared/network/projectile';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import type { Player } from '../player/Player';
import type { RemotePlayers } from '../network/RemotePlayers';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';

export interface RecentThreat {
  shooterId: string;
  /** Networked shooter body position when the shot was fired. */
  shooterWorldPos: THREE.Vector3;
  direction: THREE.Vector3;
  weaponId?: string;
  time: number;
}

export interface DamageHitSource {
  shooterWorldPos: THREE.Vector3;
}

const RECENT_THREAT_WINDOW_SEC = 2.5;
const _worldUp = new THREE.Vector3(0, 1, 0);
const _camPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _toShooter = new THREE.Vector3();
const _shooterPos = new THREE.Vector3();
const _playerPos = new THREE.Vector3();

export type SnapshotPositionReader = (sessionId: string, out: THREE.Vector3) => boolean;

export function readProjectileShooterWorldPos(
  spawn: ProjectileSpawnMessage,
  out: THREE.Vector3,
): void {
  if (
    spawn.shooterWorldX !== undefined &&
    spawn.shooterWorldY !== undefined &&
    spawn.shooterWorldZ !== undefined
  ) {
    out.set(spawn.shooterWorldX, spawn.shooterWorldY, spawn.shooterWorldZ);
    return;
  }

  out.set(spawn.x, spawn.y, spawn.z);
}

/**
 * Screen-edge angle from the victim's camera to the shooter's world position.
 * 0 = in front (top), π/2 = right, π = behind (bottom), -π/2 = left.
 *
 * Uses horizontal projection against the camera's view forward/right axes.
 */
export function computeDamageIndicatorAngle(
  camera: THREE.Camera,
  shooterWorldPos: THREE.Vector3,
): number {
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_camPos);
  camera.getWorldDirection(_forward);

  _toShooter.subVectors(shooterWorldPos, _camPos);
  _toShooter.y = 0;
  _forward.y = 0;

  const toLen = _toShooter.length();
  const fwdLen = _forward.length();
  if (toLen < 1e-6) {
    return 0;
  }
  _toShooter.multiplyScalar(1 / toLen);

  if (fwdLen < 1e-6) {
    _forward.set(0, 0, -1);
  } else {
    _forward.multiplyScalar(1 / fwdLen);
  }

  _right.crossVectors(_worldUp, _forward).normalize();

  const ahead = _toShooter.dot(_forward);
  const side = _toShooter.dot(_right);
  return Math.atan2(-side, ahead);
}

function isEnemy(
  sessionId: string,
  teamId: number,
  localTeamId: number,
  localSessionId: string,
): boolean {
  if (sessionId === localSessionId) return false;
  if (isTrainingBotSessionId(sessionId)) return true;
  return teamId !== localTeamId;
}

/** Match incoming damage to the most recent enemy shot. */
export function resolveDamageHit(
  player: Player,
  remotePlayers: RemotePlayers,
  localTeamId: number,
  localSessionId: string,
  recentThreats: readonly RecentThreat[],
  now: number,
  readSnapshot: SnapshotPositionReader,
): DamageHitSource | null {
  const feet = player.getFeetPosition();
  _playerPos.set(feet.x, feet.y + EYE_HEIGHT * 0.5, feet.z);

  let latestThreat: RecentThreat | null = null;

  for (const threat of recentThreats) {
    if (now - threat.time > RECENT_THREAT_WINDOW_SEC) continue;
    if (threat.shooterId === localSessionId) continue;

    const shooter = remotePlayers.getPlayer(threat.shooterId);
    if (!shooter?.isAlive()) continue;
    if (!isEnemy(threat.shooterId, shooter.getTeamId(), localTeamId, localSessionId)) {
      continue;
    }

    if (!latestThreat || threat.time > latestThreat.time) {
      latestThreat = threat;
    }
  }

  if (latestThreat) {
    return { shooterWorldPos: latestThreat.shooterWorldPos.clone() };
  }

  let closestDistSq = Infinity;
  let closestId: string | null = null;

  for (const [sessionId, enemy] of remotePlayers.getAllPlayers()) {
    if (!enemy.isAlive()) continue;
    if (!isEnemy(sessionId, enemy.getTeamId(), localTeamId, localSessionId)) continue;

    if (!readSnapshot(sessionId, _shooterPos)) {
      enemy.getFeetPosition(_shooterPos);
      _shooterPos.y += PLAYER_HIT_CAPSULE_HEIGHT * 0.5;
    }

    const distSq = _playerPos.distanceToSquared(_shooterPos);
    if (distSq >= closestDistSq) continue;

    closestDistSq = distSq;
    closestId = sessionId;
  }

  if (!closestId) return null;

  if (readSnapshot(closestId, _shooterPos)) {
    return { shooterWorldPos: _shooterPos.clone() };
  }

  const enemy = remotePlayers.getPlayer(closestId);
  if (!enemy) return null;

  enemy.getFeetPosition(_shooterPos);
  _shooterPos.y += PLAYER_HIT_CAPSULE_HEIGHT * 0.5;
  return { shooterWorldPos: _shooterPos.clone() };
}
