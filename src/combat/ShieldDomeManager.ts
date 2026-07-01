import type { Scene, Vector3 } from 'three';
import * as THREE from 'three';
import { segmentHitsUpperHemisphere } from '../../shared/combat/shieldDomeCollision';
import { SHIELD_DOME_RADIUS } from '../../shared/combat/shieldDomeAbility';
import { ShieldDomeFx } from '../effects/ShieldDomeFx';

interface ActiveDome {
  ownerSessionId: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  expiresAtWorldTime: number;
  fx: ShieldDomeFx;
}

export interface ShieldDomePlayerSync {
  sessionId: string;
  shieldDomeEndAt: number;
  shieldDomeCenterX: number;
  shieldDomeCenterY: number;
  shieldDomeCenterZ: number;
}

export class ShieldDomeManager {
  private readonly domes: ActiveDome[] = [];

  constructor(private readonly scene: Scene) {}

  syncFromPlayers(players: ShieldDomePlayerSync[], worldTime: number): void {
    const activeIds = new Set<string>();

    for (const player of players) {
      if (player.shieldDomeEndAt <= worldTime) continue;

      activeIds.add(player.sessionId);
      this.ensureDome(
        player.sessionId,
        player.shieldDomeCenterX,
        player.shieldDomeCenterY,
        player.shieldDomeCenterZ,
        player.shieldDomeEndAt,
      );
    }

    for (let i = this.domes.length - 1; i >= 0; i--) {
      const dome = this.domes[i];
      if (!activeIds.has(dome.ownerSessionId) || worldTime >= dome.expiresAtWorldTime) {
        dome.fx.dispose();
        this.domes.splice(i, 1);
      }
    }
  }

  update(delta: number, camera: { position: Vector3 } | null, worldTime: number): void {
    for (let i = this.domes.length - 1; i >= 0; i--) {
      const dome = this.domes[i];
      if (worldTime >= dome.expiresAtWorldTime) {
        dome.fx.dispose();
        this.domes.splice(i, 1);
        continue;
      }

      dome.fx.update(delta, camera);
    }
  }

  hasActiveDome(ownerSessionId: string, worldTime: number): boolean {
    return this.domes.some(
      (dome) =>
        dome.ownerSessionId === ownerSessionId &&
        worldTime < dome.expiresAtWorldTime,
    );
  }

  testProjectileSegment(
    from: Vector3,
    to: Vector3,
    _ownerSessionId: string,
    worldTime: number,
  ): Vector3 | null {
    for (const dome of this.domes) {
      if (worldTime >= dome.expiresAtWorldTime) continue;

      const hit = segmentHitsUpperHemisphere(
        from.x,
        from.y,
        from.z,
        to.x,
        to.y,
        to.z,
        dome.centerX,
        dome.centerY,
        dome.centerZ,
        SHIELD_DOME_RADIUS,
      );
      if (!hit) continue;

      return new THREE.Vector3(hit.x, hit.y, hit.z);
    }

    return null;
  }

  dispose(): void {
    for (const dome of this.domes) {
      dome.fx.dispose();
    }
    this.domes.length = 0;
  }

  private ensureDome(
    ownerSessionId: string,
    centerX: number,
    centerY: number,
    centerZ: number,
    expiresAtWorldTime: number,
  ): void {
    const existing = this.domes.find((dome) => dome.ownerSessionId === ownerSessionId);
    if (existing) {
      existing.centerX = centerX;
      existing.centerY = centerY;
      existing.centerZ = centerZ;
      existing.expiresAtWorldTime = expiresAtWorldTime;
      existing.fx.object.position.set(centerX, centerY, centerZ);
      return;
    }

    const fx = new ShieldDomeFx(centerX, centerY, centerZ);
    this.scene.add(fx.object);
    this.domes.push({
      ownerSessionId,
      centerX,
      centerY,
      centerZ,
      expiresAtWorldTime,
      fx,
    });
  }
}
