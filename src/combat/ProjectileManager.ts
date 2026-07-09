import type { Scene, Vector3 } from 'three';
import * as THREE from 'three';
import type { BodyPartId } from '../../shared/combat/bodyParts';
import type { PlayerHitTarget } from '../../shared/combat/playerHitbox';
import type { WeaponId } from '../../shared/content/weaponIds';
import type { MuzzleFlashConfig } from '../../shared/content/weaponConfig';
import type { ShieldDomeManager } from '../combat/ShieldDomeManager';
import { HitSplash, type HitSplashKind } from './HitSplash';
import { acquireHitSplash, initHitSplashPool, releaseHitSplash } from './hitSplashPool';
import { MuzzleFlash } from './MuzzleFlash';
import { Projectile, type ProjectileSpawnParams } from './Projectile';
import { tryMeleeHit as raycastMeleeHit } from './meleeAttack';
import {
  MAX_CONCURRENT_MUZZLE_FLASHES,
  MAX_CONCURRENT_PROJECTILES,
  MAX_CONCURRENT_SPLASHES,
  PROJECTILE_POOL_SIZE,
} from './projectileConfig';
import {
  resolveProjectilePath,
  type ResolvedHitKind,
} from './projectilePathResolve';

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

const SPLASH_KIND_BY_HIT: Record<Exclude<ResolvedHitKind, 'miss'>, HitSplashKind> = {
  world: 'world',
  shield: 'world',
  player: 'player',
};

export class ProjectileManager {
  private readonly projectiles: Projectile[] = [];
  private readonly projectilePool: Projectile[] = [];
  private readonly splashes: HitSplash[] = [];
  private readonly muzzleFlashes: MuzzleFlash[] = [];
  private readonly meta = new WeakMap<Projectile, ProjectileMeta>();
  private getHitTargets: (() => ProjectileHitTarget[]) | null = null;
  private onPlayerHit: ((targetId: string, point: Vector3, bodyPart: BodyPartId) => void) | null = null;
  private shieldDomeManager: ShieldDomeManager | null = null;
  private getWorldTime: (() => number) | null = null;
  private worldSplashCooldown = 0;

  constructor(private readonly scene: Scene) {
    initHitSplashPool(scene);
  }

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
      weaponId?: WeaponId;
      muzzleFlash?: MuzzleFlashConfig;
      boltColors?: readonly [number, number, number];
    },
  ): void {
    const visualOnly = options?.visualOnly ?? !(options?.canHitPlayers ?? false);
    const canHitPlayers = options?.canHitPlayers ?? false;
    const ownerSessionId = options?.ownerSessionId ?? '';

    while (this.projectiles.length >= MAX_CONCURRENT_PROJECTILES) {
      this.evictOldestProjectile();
    }

    if (options?.muzzleFlash) {
      while (this.muzzleFlashes.length >= MAX_CONCURRENT_MUZZLE_FLASHES) {
        this.evictOldestMuzzleFlash();
      }
      const flash = new MuzzleFlash(
        params.visualOrigin,
        params.hitRayDirection,
        options.muzzleFlash,
      );
      this.scene.add(flash.object);
      this.muzzleFlashes.push(flash);
    }

    const worldTime = this.getWorldTime?.() ?? 0;
    const hitTargets =
      canHitPlayers && !visualOnly ? this.getHitTargets?.() ?? null : null;

    const resolved = resolveProjectilePath(
      params.hitRayOrigin,
      params.hitRayDirection,
      params.speed,
      {
        canHitPlayers,
        visualOnly,
        weaponId: options?.weaponId,
        ownerSessionId,
      },
      hitTargets,
      this.shieldDomeManager,
      worldTime,
    );

    const projectile = this.acquireProjectile();
    projectile.init(params, resolved, { colors: options?.boltColors });
    this.scene.add(projectile.object);
    this.projectiles.push(projectile);
    this.meta.set(projectile, {
      canHitPlayers,
      visualOnly,
      ownerTeamId: options?.ownerTeamId ?? -1,
      ownerSessionId,
      shooterId: options?.shooterId,
      shooterWorldPos: options?.shooterWorldPos?.clone(),
    });
  }

  update(delta: number, _worldTime = 0): void {
    this.worldSplashCooldown = Math.max(0, this.worldSplashCooldown - delta);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      const result = projectile.update(delta);

      if (result.alive) continue;

      const resolved = result.resolvedHit;
      if (resolved) {
        if (
          resolved.hitKind === 'player'
          && resolved.playerSessionId
          && resolved.bodyPart
          && this.onPlayerHit
        ) {
          this.onPlayerHit(
            resolved.playerSessionId,
            resolved.hitPoint,
            resolved.bodyPart,
          );
        }

        if (resolved.hitKind !== 'miss') {
          this.spawnSplash(
            resolved.hitPoint,
            SPLASH_KIND_BY_HIT[resolved.hitKind],
          );
        }
      } else if (result.hit) {
        this.spawnSplash(result.hit.point, 'world');
      }

      this.releaseProjectile(projectile);
      this.projectiles.splice(i, 1);
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const splash = this.splashes[i]!;
      if (splash.update(delta)) continue;

      releaseHitSplash(splash);
      this.splashes.splice(i, 1);
    }

    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const flash = this.muzzleFlashes[i];
      if (flash.update(delta)) continue;

      flash.dispose();
      this.muzzleFlashes.splice(i, 1);
    }
  }

  private acquireProjectile(): Projectile {
    const pooled = this.projectilePool.pop();
    if (pooled) return pooled;

    return new Projectile();
  }

  private releaseProjectile(projectile: Projectile): void {
    projectile.release();
    if (this.projectilePool.length < PROJECTILE_POOL_SIZE) {
      this.projectilePool.push(projectile);
    }
  }

  private evictOldestProjectile(): void {
    const oldest = this.projectiles.shift();
    if (!oldest) return;
    this.releaseProjectile(oldest);
  }

  private evictOldestMuzzleFlash(): void {
    const oldest = this.muzzleFlashes.shift();
    if (!oldest) return;
    oldest.dispose();
  }

  private spawnSplash(point: Vector3, kind: HitSplashKind): void {
    if (kind === 'world') {
      if (this.worldSplashCooldown > 0) return;
      this.worldSplashCooldown = 0.06;
    }

    if (this.splashes.length >= MAX_CONCURRENT_SPLASHES) {
      const oldest = this.splashes.shift();
      if (oldest) releaseHitSplash(oldest);
    }

    const splash = acquireHitSplash(point, kind);
    splash.object.renderOrder = 20;
    this.splashes.push(splash);
  }
}
