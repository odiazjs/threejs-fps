import * as THREE from 'three';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import {
  REMOTE_HEALTHBAR_COMBAT_TIMEOUT_SEC,
  REMOTE_USERNAME_LOOK_ANGLE_DEG,
  REMOTE_USERNAME_MAX_DISTANCE,
} from './remotePlayerUiConfig';

const _camPos = new THREE.Vector3();
const _forward = new THREE.Vector3();

export interface RemotePlayerUiVisibilityState {
  readonly nameVisible: boolean;
  readonly healthBarVisible: boolean;
}

export class RemotePlayerUiVisibility {
  private readonly combatVisibleUntil = new Map<string, number>();

  recordCombat(sessionId: string, nowSec = performance.now() / 1000): void {
    const until = nowSec + REMOTE_HEALTHBAR_COMBAT_TIMEOUT_SEC;
    const prev = this.combatVisibleUntil.get(sessionId) ?? 0;
    this.combatVisibleUntil.set(sessionId, Math.max(prev, until));
  }

  clearSession(sessionId: string): void {
    this.combatVisibleUntil.delete(sessionId);
  }

  prune(nowSec = performance.now() / 1000): void {
    for (const [sessionId, until] of this.combatVisibleUntil) {
      if (until <= nowSec) {
        this.combatVisibleUntil.delete(sessionId);
      }
    }
  }

  isHealthBarVisible(sessionId: string, nowSec = performance.now() / 1000): boolean {
    return (this.combatVisibleUntil.get(sessionId) ?? 0) > nowSec;
  }

  shouldShowUsername(
    camera: THREE.Camera,
    targetFeet: THREE.Vector3,
    maxDistance = REMOTE_USERNAME_MAX_DISTANCE,
    lookAngleDeg = REMOTE_USERNAME_LOOK_ANGLE_DEG,
  ): boolean {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(_camPos);
    camera.getWorldDirection(_forward);

    const targetY = targetFeet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5;
    const dx = targetFeet.x - _camPos.x;
    const dy = targetY - _camPos.y;
    const dz = targetFeet.z - _camPos.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > maxDistance || distance < 0.75) {
      return false;
    }

    const inv = 1 / distance;
    const dot =
      dx * inv * _forward.x + dy * inv * _forward.y + dz * inv * _forward.z;
    const cosThreshold = Math.cos((lookAngleDeg * Math.PI) / 180);
    return dot >= cosThreshold;
  }

  resolve(
    sessionId: string,
    camera: THREE.Camera,
    targetFeet: THREE.Vector3,
    alive: boolean,
    nowSec = performance.now() / 1000,
  ): RemotePlayerUiVisibilityState {
    if (!alive) {
      return { nameVisible: false, healthBarVisible: false };
    }

    return {
      nameVisible: this.shouldShowUsername(camera, targetFeet),
      healthBarVisible: this.isHealthBarVisible(sessionId, nowSec),
    };
  }
}
