import type { Scene, Vector3 } from 'three';
import type { PlayerHitTarget } from '../../shared/combat/playerHitbox';
import { rayHitsPlayer } from '../../shared/combat/playerHitbox';
import { HitSplash } from './HitSplash';
import { Projectile } from './Projectile';
import { PROJECTILE_SPEED } from './projectileConfig';

export interface ProjectileHitTarget extends PlayerHitTarget {
  sessionId: string;
  teamId: number;
}

interface ProjectileMeta {
  canHitPlayers: boolean;
  ownerTeamId: number;
}

export class ProjectileManager {
  private readonly projectiles: Projectile[] = [];
  private readonly splashes: HitSplash[] = [];
  private readonly meta = new WeakMap<Projectile, ProjectileMeta>();
  private getHitTargets: (() => ProjectileHitTarget[]) | null = null;
  private onPlayerHit: ((targetId: string) => void) | null = null;

  constructor(private readonly scene: Scene) {}

  setPlayerHitHandlers(
    getHitTargets: () => ProjectileHitTarget[],
    onPlayerHit: (targetId: string) => void,
  ): void {
    this.getHitTargets = getHitTargets;
    this.onPlayerHit = onPlayerHit;
  }

  spawn(
    origin: Vector3,
    direction: Vector3,
    options?: { canHitPlayers?: boolean; ownerTeamId?: number },
  ): void {
    const projectile = new Projectile(origin, direction, PROJECTILE_SPEED);
    this.scene.add(projectile.object);
    this.projectiles.push(projectile);
    this.meta.set(projectile, {
      canHitPlayers: options?.canHitPlayers ?? false,
      ownerTeamId: options?.ownerTeamId ?? -1,
    });
  }

  update(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      let playerHitPoint: Vector3 | null = null;

      const result = projectile.update(delta, (from, to) => {
        const hitPoint = this.tryPlayerHitSegment(projectile, from, to);
        if (!hitPoint) return false;
        playerHitPoint = hitPoint;
        return true;
      });

      if (playerHitPoint) {
        this.spawnSplash(playerHitPoint);
        projectile.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (result.alive) continue;

      if (result.hit) {
        this.spawnSplash(result.hit.point);
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
  }

  private tryPlayerHitSegment(
    projectile: Projectile,
    from: Vector3,
    to: Vector3,
  ): Vector3 | null {
    const info = this.meta.get(projectile);
    if (!info?.canHitPlayers || !this.getHitTargets || !this.onPlayerHit) {
      return null;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= 1e-6) return null;

    const dirX = dx / dist;
    const dirY = dy / dist;
    const dirZ = dz / dist;

    for (const target of this.getHitTargets()) {
      if (target.teamId === info.ownerTeamId) continue;
      if (
        !rayHitsPlayer(
          from.x,
          from.y,
          from.z,
          dirX,
          dirY,
          dirZ,
          dist,
          target,
        )
      ) {
        continue;
      }

      this.onPlayerHit(target.sessionId);
      return to.clone();
    }

    return null;
  }

  private spawnSplash(point: Vector3): void {
    const splash = new HitSplash(point);
    this.scene.add(splash.object);
    this.splashes.push(splash);
  }
}
