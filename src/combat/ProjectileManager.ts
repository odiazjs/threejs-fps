import type { Scene, Vector3 } from 'three';
import { HitSplash } from './HitSplash';
import { Projectile } from './Projectile';
import { PROJECTILE_SPEED } from './projectileConfig';

export class ProjectileManager {
  private readonly projectiles: Projectile[] = [];
  private readonly splashes: HitSplash[] = [];

  constructor(private readonly scene: Scene) {}

  spawn(origin: Vector3, direction: Vector3): void {
    const projectile = new Projectile(origin, direction, PROJECTILE_SPEED);
    this.scene.add(projectile.object);
    this.projectiles.push(projectile);
  }

  update(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      const result = projectile.update(delta);

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

  private spawnSplash(point: Vector3): void {
    const splash = new HitSplash(point);
    this.scene.add(splash.object);
    this.splashes.push(splash);
  }
}
