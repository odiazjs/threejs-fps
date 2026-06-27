import * as THREE from 'three';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import type { Player } from '../player/Player';
import type { RemotePlayers } from '../network/RemotePlayers';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';

export interface RecentThreat {
  shooterId: string;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  time: number;
}

const RECENT_THREAT_WINDOW_SEC = 2;
const MIN_THREAT_SCORE = 0.15;

const _camPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _toThreat = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _shooterPos = new THREE.Vector3();
const _playerPos = new THREE.Vector3();

/** Horizontal bearing from camera forward to world target (radians, + = right). */
export function computeBearingFromCamera(
  camera: THREE.Camera,
  worldTarget: THREE.Vector3,
): number {
  camera.getWorldPosition(_camPos);
  _toThreat.subVectors(worldTarget, _camPos);
  _toThreat.y = 0;
  if (_toThreat.lengthSq() < 1e-6) return 0;
  _toThreat.normalize();

  camera.getWorldDirection(_forward);
  _forward.y = 0;
  if (_forward.lengthSq() < 1e-6) return 0;
  _forward.normalize();

  const cross = _forward.x * _toThreat.z - _forward.z * _toThreat.x;
  const dot = _forward.x * _toThreat.x + _forward.z * _toThreat.z;
  return Math.atan2(cross, dot);
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

function scoreThreat(
  threat: RecentThreat,
  playerPos: THREE.Vector3,
  now: number,
  remotePlayers: RemotePlayers,
): number {
  const age = now - threat.time;
  if (age > RECENT_THREAT_WINDOW_SEC) return -1;

  const shooter = remotePlayers.getPlayer(threat.shooterId);
  if (!shooter?.isAlive()) return -1;

  _toPlayer.subVectors(playerPos, threat.origin);
  const distSq = _toPlayer.lengthSq();
  if (distSq < 1e-6) return -1;
  _toPlayer.normalize();

  const alignment = threat.direction.dot(_toPlayer);
  if (alignment < 0.05) return -1;

  const recency = 1 - age / RECENT_THREAT_WINDOW_SEC;
  return recency * alignment;
}

function readShooterAimPosition(shooter: Player, out: THREE.Vector3): void {
  shooter.getFeetPosition(out);
  out.y += EYE_HEIGHT * 0.85;
}

export function resolveDamageBearing(
  player: Player,
  camera: THREE.Camera,
  remotePlayers: RemotePlayers,
  localTeamId: number,
  localSessionId: string,
  recentThreats: readonly RecentThreat[],
  now: number,
): number | null {
  const feet = player.getFeetPosition();
  _playerPos.set(feet.x, feet.y + EYE_HEIGHT * 0.5, feet.z);

  let bestScore = MIN_THREAT_SCORE;
  let bestBearing: number | null = null;

  for (const threat of recentThreats) {
    const shooter = remotePlayers.getPlayer(threat.shooterId);
    if (!shooter?.isAlive()) continue;
    if (!isEnemy(threat.shooterId, shooter.getTeamId(), localTeamId, localSessionId)) {
      continue;
    }

    const score = scoreThreat(threat, _playerPos, now, remotePlayers);
    if (score <= bestScore) continue;

    bestScore = score;
    readShooterAimPosition(shooter, _shooterPos);
    bestBearing = computeBearingFromCamera(camera, _shooterPos);
  }

  if (bestBearing !== null) {
    return bestBearing;
  }

  let closestDistSq = Infinity;

  for (const [sessionId, enemy] of remotePlayers.getAllPlayers()) {
    if (!enemy.isAlive()) continue;
    if (!isEnemy(sessionId, enemy.getTeamId(), localTeamId, localSessionId)) continue;

    readShooterAimPosition(enemy, _shooterPos);
    const distSq = _playerPos.distanceToSquared(_shooterPos);
    if (distSq >= closestDistSq) continue;

    closestDistSq = distSq;
    bestBearing = computeBearingFromCamera(camera, _shooterPos);
  }

  return bestBearing;
}
