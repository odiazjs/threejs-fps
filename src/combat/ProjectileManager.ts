import type { Scene, Vector3 } from 'three';
import * as THREE from 'three';
import type { BodyPartId } from '../../shared/combat/bodyParts';
import type { PlayerHitTarget } from '../../shared/combat/playerHitbox';
import { raycastPlayerBodyPart } from '../../shared/combat/playerHitbox';
import type { MuzzleFlashConfig } from '../../shared/content/weaponConfig';
import type { ShieldDomeManager } from '../combat/ShieldDomeManager';
import { HitSplash, type HitSplashKind } from './HitSplash';
import { MuzzleFlash } from './MuzzleFlash';
import {
  Projectile,
  type ProjectileLevelHit,
  type ProjectileSegmentProbe,
  type ProjectileSpawnParams,
} from './Projectile';
import { tryMeleeHit as raycastMeleeHit } from './meleeAttack';

export interface ProjectileHitTarget extends PlayerHitTarget {
  sessionId: string;
  teamId: number;
}

interface ProjectileMeta {
  canHitPlayers: boolean;
  visualOnly: boolean;
  ownerTeamId: number;
  ownerSessionId: string;
  shooterId?: string;
  shooterWorldPos?: THREE.Vector3;
}

interface SegmentHitCandidate {
  point: THREE.Vector3;
  distance: number;
}

const _aimOrigin = new THREE.Vector3();
const _aimDir = new THREE.Vector3();

export class ProjectileManager {
  private readonly projectiles: Projectile[] = [];
  private readonly splashes: HitSplash[] = [];
  private readonly muzzleFlashes: MuzzleFlash[] = [];
  private readonly meta = new WeakMap<Projectile, ProjectileMeta>();
  private getHitTargets: (() => ProjectileHitTarget[]) | null = null;
  private onPlayerHit: ((targetId: string, point: Vector3, bodyPart: BodyPartId) => void) | null = null;
  private shieldDomeManager: ShieldDomeManager | null = null;
  private getWorldTime: (() => number) | null = null;

  constructor(private readonly scene: Scene) {}

  setShieldDomeManager(manager: ShieldDomeManager): void {
    this.shieldDomeManager = manager;
  }

  setWorldTimeProvider(provider: () => number): void {
    this.getWorldTime = provider;
  }

  setPlayerHitHandlers(
    getHitTargets: () => ProjectileHitTarget[],
    onPlayerHit: (targetId: string, point: Vector3, bodyPart: BodyPartId) => void,
  ): void {
    this.getHitTargets = getHitTargets;
    this.onPlayerHit = onPlayerHit;
  }

  tryMeleeHit(
    camera: THREE.Camera,
    range: number,
    ownerSessionId: string,
  ): boolean {
    if (!this.getHitTargets || !this.onPlayerHit) return false;

    const hit = raycastMeleeHit(
      camera,
      range,
      this.getHitTargets,
      ownerSessionId,
    );
    if (!hit) return false;

    this.spawnSplash(hit.point, 'player');
    this.onPlayerHit(hit.sessionId, hit.point, hit.bodyPart);
    return true;
  }

  spawn(
    params: ProjectileSpawnParams,
    options?: {
      canHitPlayers?: boolean;
      visualOnly?: boolean;
      ownerTeamId?: number;
      ownerSessionId?: string;
      shooterId?: string;
      shooterWorldPos?: Vector3;
      muzzleFlash?: MuzzleFlashConfig;
      boltColors?: readonly [number, number, number];
    },
  ): void {
    if (options?.muzzleFlash) {
      const flash = new MuzzleFlash(
        params.visualOrigin,
        params.hitRayDirection,
        options.muzzleFlash,
      );
      this.scene.add(flash.object);
      this.muzzleFlashes.push(flash);
    }

    const projectile = new Projectile(params, { colors: options?.boltColors });
    this.scene.add(projectile.object);
    this.projectiles.push(projectile);
    this.meta.set(projectile, {
      canHitPlayers: options?.canHitPlayers ?? false,
      visualOnly: options?.visualOnly ?? !(options?.canHitPlayers ?? false),
      ownerTeamId: options?.ownerTeamId ?? -1,
      ownerSessionId: options?.ownerSessionId ?? '',
      shooterId: options?.shooterId,
      shooterWorldPos: options?.shooterWorldPos?.clone(),
    });
  }

  update(delta: number, worldTime = 0): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      const info = this.meta.get(projectile);
      const impactRef: {
        value: { point: THREE.Vector3; kind: HitSplashKind } | null;
      } = { value: null };

      const probe: ProjectileSegmentProbe | undefined = info?.visualOnly
        ? undefined
        : (from, to, levelHit) => {
          const resolved = this.resolveGameplaySegmentHit(
            projectile,
            from,
            to,
            levelHit,
            worldTime,
          );
          if (resolved) {
            impactRef.value = {
              point: resolved.point,
              kind: resolved.isPlayer ? 'player' : 'world',
            };
          }
          return resolved?.point ?? null;
        };

      const result = projectile.update(delta, probe);

      if (result.alive) continue;

      if (result.hit) {
        this.spawnSplash(result.hit.point, 'world');
      } else if (impactRef.value) {
        this.spawnSplash(impactRef.value.point, impactRef.value.kind);
      }

      projectile.dispose();
      this.projectiles.splice(i, 1);
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const splash = this.splashes[i];
      if (splash.update(delta)) continue;

      splash.dispose();
      this.splashes.splice(i, 1);
    }

    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const flash = this.muzzleFlashes[i];
      if (flash.update(delta)) continue;

      flash.dispose();
      this.muzzleFlashes.splice(i, 1);
    }
  }

  private resolveGameplaySegmentHit(
    projectile: Projectile,
    from: THREE.Vector3,
    to: THREE.Vector3,
    levelHit: ProjectileLevelHit | null,
    worldTime: number,
  ): { point: THREE.Vector3; isPlayer: boolean } | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const travel = Math.hypot(dx, dy, dz);
    if (travel <= 1e-6) return null;

    const dirX = dx / travel;
    const dirY = dy / travel;
    const dirZ = dz / travel;

    projectile.getAimOrigin(_aimOrigin);
    projectile.getAimDirection(_aimDir);
    const segStartDist = (
      (from.x - _aimOrigin.x) * _aimDir.x
      + (from.y - _aimOrigin.y) * _aimDir.y
      + (from.z - _aimOrigin.z) * _aimDir.z
    );
    const segEndDist = (
      (to.x - _aimOrigin.x) * _aimDir.x
      + (to.y - _aimOrigin.y) * _aimDir.y
      + (to.z - _aimOrigin.z) * _aimDir.z
    );

    let best: SegmentHitCandidate | null = null;

    if (levelHit) {
      const absDist = segStartDist + levelHit.distance;
      if (levelHit.distance >= 0 && levelHit.distance <= travel + 1e-5) {
        best = {
          point: new THREE.Vector3(levelHit.x, levelHit.y, levelHit.z),
          distance: absDist,
        };
      }
    }

    const shieldHit = this.tryShieldDomeSegmentHit(
      projectile,
      from,
      dirX,
      dirY,
      dirZ,
      travel,
      worldTime,
    );
    if (shieldHit) {
      const absDist = segStartDist + shieldHit.distance;
      if (!best || absDist < best.distance) {
        best = { point: shieldHit.point, distance: absDist };
      }
    }

    const playerHit = this.tryPlayerRayHit(projectile, segEndDist);
    if (playerHit && (!best || playerHit.distance < best.distance)) {
      if (!this.onPlayerHit) return null;
      this.onPlayerHit(playerHit.sessionId, playerHit.point, playerHit.bodyPart);
      return { point: playerHit.point, isPlayer: true };
    }

    if (!best) return null;
    return { point: best.point, isPlayer: false };
  }

  private tryShieldDomeSegmentHit(
    projectile: Projectile,
    from: THREE.Vector3,
    dirX: number,
    dirY: number,
    dirZ: number,
    travel: number,
    worldTime: number,
  ): SegmentHitCandidate | null {
    if (!this.shieldDomeManager) return null;

    const info = this.meta.get(projectile);
    const ownerSessionId = info?.ownerSessionId ?? '';
    const time = this.getWorldTime?.() ?? worldTime;
    const endX = from.x + dirX * travel;
    const endY = from.y + dirY * travel;
    const endZ = from.z + dirZ * travel;
    const hitPoint = this.shieldDomeManager.testProjectileSegment(
      from,
      new THREE.Vector3(endX, endY, endZ),
      ownerSessionId,
      time,
    );
    if (!hitPoint) return null;

    const distance = this.distanceAlongSegment(from, dirX, dirY, dirZ, hitPoint);
    if (distance < 0 || distance > travel + 1e-5) return null;

    return { point: hitPoint, distance };
  }

  private tryPlayerRayHit(
    projectile: Projectile,
    maxDist: number,
  ): { sessionId: string; point: THREE.Vector3; bodyPart: BodyPartId; distance: number } | null {
    const info = this.meta.get(projectile);
    if (!info?.canHitPlayers || !this.getHitTargets || maxDist <= 1e-6) {
      return null;
    }

    projectile.getAimOrigin(_aimOrigin);
    projectile.getAimDirection(_aimDir);

    let bestHit: {
      target: ProjectileHitTarget;
      bodyHit: { part: BodyPartId; distance: number };
    } | null = null;

    for (const target of this.getHitTargets()) {
      if (info.ownerSessionId && target.sessionId === info.ownerSessionId) {
        continue;
      }

      const bodyHit = raycastPlayerBodyPart(
        _aimOrigin.x,
        _aimOrigin.y,
        _aimOrigin.z,
        _aimDir.x,
        _aimDir.y,
        _aimDir.z,
        maxDist,
        target,
      );
      if (!bodyHit) continue;
      if (bestHit && bodyHit.distance >= bestHit.bodyHit.distance) continue;
      bestHit = { target, bodyHit };
    }

    if (!bestHit) return null;

    const point = _aimOrigin.clone().addScaledVector(_aimDir, bestHit.bodyHit.distance);

    return {
      sessionId: bestHit.target.sessionId,
      point,
      bodyPart: bestHit.bodyHit.part,
      distance: bestHit.bodyHit.distance,
    };
  }

  private distanceAlongSegment(
    from: THREE.Vector3,
    dirX: number,
    dirY: number,
    dirZ: number,
    point: THREE.Vector3,
  ): number {
    return (
      (point.x - from.x) * dirX
      + (point.y - from.y) * dirY
      + (point.z - from.z) * dirZ
    );
  }

  private spawnSplash(point: Vector3, kind: HitSplashKind): void {
    const splash = new HitSplash(point, kind);
    splash.object.renderOrder = 20;
    this.scene.add(splash.object);
    this.splashes.push(splash);
  }
}
