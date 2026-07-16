import type { Scene, Vector3 } from 'three';
import * as THREE from 'three';
import type { BodyPartId } from '../../shared/combat/bodyParts';
import type { PlayerHitTarget } from '../../shared/combat/playerHitbox';
import type { WeaponId } from '../../shared/content/weaponIds';
import type { MuzzleFlashConfig } from '../../shared/content/weaponConfig';
import type { ShieldDomeManager } from '../combat/ShieldDomeManager';
import { BulletHoleDecals } from './BulletHoleDecals';
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
import { PICKABLE_WEAPON_CONFIGS } from '../content/weaponConfig';

const PREWARM_POSITION = new THREE.Vector3(0, -10_000, 0);
const PREWARM_DIRECTION = new THREE.Vector3(0, 0, -1);

export interface ProjectileHitTarget extends PlayerHitTarget {
  sessionId: string;
  teamId: number;
}

interface ProjectileMeta {
  canHitPlayers: boolean;
  visualOnly: boolean;
  spawnBulletHoles: boolean;
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
  private readonly fadingProjectiles: Projectile[] = [];
  private readonly projectilePool: Projectile[] = [];
  private readonly splashes: HitSplash[] = [];
  private readonly muzzleFlashes: MuzzleFlash[] = [];
  private readonly meta = new WeakMap<Projectile, ProjectileMeta>();
  private getHitTargets: (() => ProjectileHitTarget[]) | null = null;
  private onPlayerHit: ((targetId: string, point: Vector3, bodyPart: BodyPartId) => void) | null = null;
  private shieldDomeManager: ShieldDomeManager | null = null;
  private getWorldTime: (() => number) | null = null;
  private resolveWeaponMaxHitDistance: ((weaponId: WeaponId) => number | undefined) | null = null;
  private worldSplashCooldown = 0;
  private readonly bulletHoles: BulletHoleDecals;
  /**
   * Muzzle flashes pooled per weapon config — constructing GPU buffers and
   * materials per shot (10/s on autos) causes GC hitches during fights.
   */
  private readonly muzzleFlashPool = new Map<MuzzleFlashConfig, MuzzleFlash[]>();

  constructor(private readonly scene: Scene) {
    initHitSplashPool(scene);
    this.bulletHoles = new BulletHoleDecals(scene);
  }

  setWeaponMaxHitDistanceResolver(
    resolver: (weaponId: WeaponId) => number | undefined,
  ): void {
    this.resolveWeaponMaxHitDistance = resolver;
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

  private prewarmFlashes: MuzzleFlash[] = [];

  /**
   * Pre-build every pooled GPU resource the first shot/hit would otherwise
   * create mid-fight: parked projectiles (bolt visuals + smoke trails), one
   * pooled muzzle flash per weapon config, and a bullet-hole decal.
   *
   * Everything is left VISIBLE (parked far below the map) so the caller's
   * renderer.compileAsync pass compiles their programs; call
   * finishGpuPrewarm() afterwards to hide them into the pools. Keeping the
   * instances alive keeps their programs in three's program cache — the old
   * prewarm disposed its throwaway instances, which released the compiled
   * programs and made the first real shot compile everything again.
   */
  prewarmGpuResources(projectileCount = 12): void {
    while (this.projectilePool.length < Math.min(projectileCount, PROJECTILE_POOL_SIZE)) {
      const projectile = new Projectile();
      // Alternate styles so both bolt and bio-liquid programs get compiled.
      const style = this.projectilePool.length % 2 === 0 ? 'bolt' : 'bioLiquid';
      projectile.prewarmAt(PREWARM_POSITION, PREWARM_DIRECTION, style);
      this.scene.add(projectile.object);
      this.scene.add(projectile.smokeTrail.object);
      this.projectilePool.push(projectile);
    }

    for (const config of PICKABLE_WEAPON_CONFIGS) {
      if (!config.muzzleFlash) continue;
      if (this.muzzleFlashPool.get(config.muzzleFlash)?.length) continue;
      const flash = new MuzzleFlash(
        PREWARM_POSITION,
        PREWARM_DIRECTION,
        config.muzzleFlash,
      );
      this.scene.add(flash.object);
      this.prewarmFlashes.push(flash);
    }

    this.bulletHoles.prewarm();
  }

  /** Hide the prewarm set into the pools once shaders are compiled. */
  finishGpuPrewarm(): void {
    for (const projectile of this.projectilePool) {
      projectile.object.visible = false;
      projectile.smokeTrail.object.visible = false;
    }
    for (const flash of this.prewarmFlashes) {
      this.releaseMuzzleFlash(flash);
    }
    this.prewarmFlashes.length = 0;
    this.bulletHoles.finishPrewarm();
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
      /** Armory-upgraded max hit distance; preferred over catalog resolver. */
      maxHitDistance?: number;
      /** Visual-only world impact distance (lobby drone hits, etc.). */
      forcedHitDistance?: number;
      /** When false, skip bullet-hole decals on world impacts (lobby drone shots). */
      spawnBulletHoles?: boolean;
      muzzleFlash?: MuzzleFlashConfig;
      /** Uniform boost on the muzzle flash (e.g. ADS compensation). */
      muzzleFlashScale?: number;
      /** Side-vent attach offsets in flash-local space. */
      sideVentOffsets?: readonly THREE.Vector3[];
      boltColors?: readonly [number, number, number];
      projectileStyle?: 'bolt' | 'bioLiquid';
      projectileGravity?: number;
      /** Uniform bolt scale (shotgun pellets run smaller). */
      boltSizeScale?: number;
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
      const flash = this.acquireMuzzleFlash(
        params.visualOrigin,
        params.hitRayDirection,
        options.muzzleFlash,
        options.muzzleFlashScale ?? 1,
        options.sideVentOffsets,
      );
      this.muzzleFlashes.push(flash);
    }

    const worldTime = this.getWorldTime?.() ?? 0;
    const hitTargets =
      canHitPlayers && !visualOnly ? this.getHitTargets?.() ?? null : null;

    const resolvedMaxHit =
      options?.maxHitDistance ??
      (options?.weaponId && this.resolveWeaponMaxHitDistance
        ? this.resolveWeaponMaxHitDistance(options.weaponId)
        : undefined);

    const resolved = resolveProjectilePath(
      params.hitRayOrigin,
      params.hitRayDirection,
      params.speed,
      {
        canHitPlayers,
        visualOnly,
        weaponId: options?.weaponId,
        ownerSessionId,
        maxHitDistance: resolvedMaxHit,
        forcedHitDistance: options?.forcedHitDistance,
      },
      hitTargets,
      this.shieldDomeManager,
      worldTime,
    );

    const projectile = this.acquireProjectile();
    projectile.init(params, resolved, {
      colors: options?.boltColors,
      style: options?.projectileStyle,
      gravity: options?.projectileGravity,
      sizeScale: options?.boltSizeScale,
    });
    this.scene.add(projectile.object);
    this.scene.add(projectile.smokeTrail.object);
    this.projectiles.push(projectile);
    this.meta.set(projectile, {
      canHitPlayers,
      visualOnly,
      spawnBulletHoles: options?.spawnBulletHoles ?? true,
      ownerTeamId: options?.ownerTeamId ?? -1,
      ownerSessionId,
      shooterId: options?.shooterId,
      shooterWorldPos: options?.shooterWorldPos?.clone(),
    });
  }

  update(delta: number, _worldTime = 0): void {
    this.worldSplashCooldown = Math.max(0, this.worldSplashCooldown - delta);
    this.bulletHoles.update(delta);

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

        // Bullet holes only on level geometry — never on players or shields.
        const meta = this.meta.get(projectile);
        if (
          resolved.hitKind === 'world'
          && resolved.hitNormal
          && (meta?.spawnBulletHoles ?? true)
        ) {
          this.bulletHoles.spawn(resolved.hitPoint, resolved.hitNormal);
        }
      } else if (result.hit) {
        this.spawnSplash(result.hit.point, 'world');
      }

      this.releaseProjectile(projectile);
      this.projectiles.splice(i, 1);
    }

    for (let i = this.fadingProjectiles.length - 1; i >= 0; i--) {
      const fading = this.fadingProjectiles[i]!;
      if (fading.updateFadingSmoke(delta)) continue;

      fading.disposeSmokeTrail();
      if (this.projectilePool.length < PROJECTILE_POOL_SIZE) {
        this.projectilePool.push(fading);
      }
      this.fadingProjectiles.splice(i, 1);
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

      this.releaseMuzzleFlash(flash);
      this.muzzleFlashes.splice(i, 1);
    }
  }

  private acquireMuzzleFlash(
    origin: Vector3,
    direction: Vector3,
    config: MuzzleFlashConfig,
    scale: number,
    sideVentOffsets?: readonly THREE.Vector3[],
  ): MuzzleFlash {
    const ventCount = sideVentOffsets?.length ?? 0;
    const pool = this.muzzleFlashPool.get(config);
    if (pool) {
      // Vent burst meshes are built at construction — only reuse a matching shape.
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i]!.ventBurstCount !== ventCount) continue;
        const flash = pool.splice(i, 1)[0]!;
        flash.restart(origin, direction, scale, sideVentOffsets);
        return flash;
      }
    }

    const flash = new MuzzleFlash(origin, direction, config, scale, sideVentOffsets);
    this.scene.add(flash.object);
    return flash;
  }

  private releaseMuzzleFlash(flash: MuzzleFlash): void {
    flash.deactivate();
    let pool = this.muzzleFlashPool.get(flash.config);
    if (!pool) {
      pool = [];
      this.muzzleFlashPool.set(flash.config, pool);
    }
    if (pool.length < MAX_CONCURRENT_MUZZLE_FLASHES) {
      pool.push(flash);
      return;
    }
    flash.dispose();
  }

  private acquireProjectile(): Projectile {
    const pooled = this.projectilePool.pop();
    if (pooled) return pooled;

    return new Projectile();
  }

  private releaseProjectile(projectile: Projectile): void {
    projectile.release();
    if (projectile.smokeTrail.isActive()) {
      this.fadingProjectiles.push(projectile);
      return;
    }
    projectile.disposeSmokeTrail();
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
    this.releaseMuzzleFlash(oldest);
  }

  private spawnSplash(point: Vector3, kind: HitSplashKind): void {
    if (kind === 'world') {
      // Short cooldown so shotgun volleys still land several visible bursts.
      if (this.worldSplashCooldown > 0) return;
      this.worldSplashCooldown = 0.025;
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
