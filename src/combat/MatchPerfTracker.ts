import type { MatchPerformanceStats } from '../../shared/content/matchRewards';
import { sanitizeMatchPerformance } from '../../shared/content/matchRewards';

/**
 * In-memory per-match performance accumulator (client or server room).
 * Reset when a new TDM match starts; snapshot after it ends for award upload.
 */
export class MatchPerfTracker {
  private active = false;
  private kills = 0;
  private deaths = 0;
  private damageDealt = 0;
  private damageTaken = 0;
  private headshotDamage = 0;
  private shotsFired = 0;
  private shotsHit = 0;

  beginMatch(): void {
    this.active = true;
    this.kills = 0;
    this.deaths = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.headshotDamage = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
  }

  endMatch(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  recordKill(): void {
    if (!this.active) return;
    this.kills += 1;
  }

  recordDeath(): void {
    if (!this.active) return;
    this.deaths += 1;
  }

  recordDamageDealt(amount: number, headshot: boolean): void {
    if (!this.active) return;
    const dmg = Math.max(0, amount);
    if (dmg <= 0) return;
    this.damageDealt += dmg;
    if (headshot) this.headshotDamage += dmg;
  }

  recordDamageTaken(amount: number): void {
    if (!this.active) return;
    const dmg = Math.max(0, amount);
    if (dmg <= 0) return;
    this.damageTaken += dmg;
  }

  recordShotFired(): void {
    if (!this.active) return;
    this.shotsFired += 1;
  }

  recordShotHit(): void {
    if (!this.active) return;
    this.shotsHit += 1;
  }

  /** Prefer server matchKills when available (authoritative). */
  syncKills(matchKills: number): void {
    if (!this.active) return;
    if (!Number.isFinite(matchKills)) return;
    this.kills = Math.max(this.kills, Math.floor(matchKills));
  }

  snapshot(): MatchPerformanceStats {
    return sanitizeMatchPerformance({
      kills: this.kills,
      deaths: this.deaths,
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      headshotDamage: this.headshotDamage,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
    });
  }
}
